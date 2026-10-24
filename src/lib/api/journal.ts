import { addDoc, doc, getDoc, increment, limit, orderBy, query, serverTimestamp, where, writeBatch, type DocumentData } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { useAuthStore } from "@/stores/authStore";
import { casiers, volumeFr } from "@/lib/format";
import { col, ecrire, lister, maintenant, type Commande, type Id } from "./outils";
import { ajouterMouvement } from "./stock";
import { mouvementVides, videsActuels } from "./casiers";
import type { Format } from "./catalogue";

/**
 * Journal des actions : qui a fait quoi, quand, avec l'état d'avant et d'après.
 *
 * Chaque commande sensible est entourée (voir index.ts) : on lit l'état avant, la commande
 * s'exécute, puis une entrée est écrite avec, si possible, la « recette » pour revenir en
 * arrière. Une commande qui échoue n'écrit rien. Les ventes, réceptions et paiements sont
 * notés mais pas restaurables ici (une vente s'annule depuis l'historique des ventes).
 */
export type Categorie = "prix" | "catalogue" | "clients" | "fournisseurs" | "stock" | "ventes" | "comptes" | "utilisateurs" | "parametres";

/** Opérations sur des documents pour revenir en arrière (appliquées par un admin). */
interface OpDocument { op: "set" | "update" | "delete"; chemin: string; data?: DocumentData }
/** Remise en arrière d'un stock : un mouvement inverse, le stock a pu bouger depuis. */
interface OpStock { format_id: Id; delta: number }
interface OpVides { emballage_id: Id; delta: number }
export interface Restauration { documents?: OpDocument[]; stock?: OpStock[]; vides?: OpVides[]; avertissement?: string }

export interface EntreeJournal {
  id: Id; categorie: Categorie; action: string; libelle: string; details: string[];
  restauration: Restauration | null;
  date: string; utilisateur_nom: string;
  restaure_le?: string | null; restaure_par?: string | null;
}

type Nouvelle = Omit<EntreeJournal, "id" | "date" | "utilisateur_nom">;

/** Écrit une entrée (sans attendre le serveur : hors ligne, elle part au retour du réseau). */
export function journaliser(e: Nouvelle) {
  return ecrire(addDoc(col("journal"), {
    ...e, date: maintenant(), cree_le: serverTimestamp(),
    utilisateur_uid: auth.currentUser?.uid, utilisateur_nom: useAuthStore.getState().profil?.nom ?? "",
    restaure_le: null, restaure_par: null,
  }));
}

// ── Lectures utiles ───────────────────────────────────────────────────────

type Doc = { id: Id } & DocumentData;
async function lire(chemin: string): Promise<Doc | null> {
  const s = await getDoc(doc(db, chemin));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}
async function chercher(collection: string, champ: string, valeur: unknown): Promise<Doc[]> {
  return lister<Doc>(query(col(collection), where(champ, "==", valeur)));
}
/** Le document tel qu'enregistré, sans son id (pour le recréer à l'identique). */
const corps = (d: Doc) => { const { id: _id, ...reste } = d; return reste; };
const remettre = (collection: string, d: Doc): OpDocument => ({ op: "set", chemin: `${collection}/${d.id}`, data: corps(d) });
const retirer = (chemin: string): OpDocument => ({ op: "delete", chemin });

async function nomFormat(f: DocumentData | null): Promise<string> {
  if (!f) return "format ?";
  const p = f.produit_id ? await lire(`produits/${f.produit_id}`) : null;
  return `${p?.nom ?? "?"} ${volumeFr(f.volume, f.unite, f.casier ?? null)}`;
}
const fcfa = (n: unknown) => (typeof n === "number" ? `${n.toLocaleString("fr-FR")} F` : "—");
const prixOuAFixer = (n: unknown) => (n === 0 ? "à fixer" : fcfa(n));
/** Lignes « champ : avant → après » pour les champs qui ont changé. */
function differences(avant: DocumentData | null, apres: DocumentData | null, champs: Record<string, string>, format: (c: string, v: unknown) => string = (_c, v) => String(v ?? "—")) {
  return Object.entries(champs)
    .filter(([c]) => JSON.stringify(avant?.[c] ?? null) !== JSON.stringify(apres?.[c] ?? null))
    .map(([c, nom]) => `${nom} : ${format(c, avant?.[c])} → ${format(c, apres?.[c])}`);
}
const champsAvant = (d: Doc | null, champs: string[]) => Object.fromEntries(champs.map(c => [c, d?.[c] ?? null]));

// ── Suivi de chaque commande ──────────────────────────────────────────────

interface Suivi {
  avant: (a: Record<string, unknown>) => Promise<unknown>;
  apres: (a: Record<string, unknown>, res: unknown, ctx: any) => Promise<Nouvelle | null>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const CHAMPS_FORMAT = ["prix", "seuil_alerte", "emballage_id", "volume", "unite"];

export const suivis: Record<string, Suivi> = {
  // ── Catalogue
  create_produit: {
    avant: async () => null,
    apres: async (a, id) => ({ categorie: "catalogue", action: "create_produit", libelle: `Produit créé : ${a.nom}`, details: [],
      restauration: { documents: [retirer(`produits/${id}`)], avertissement: "Le produit sera supprimé (ses formats créés depuis restent à supprimer à part)." } }),
  },
  update_produit: {
    avant: async a => lire(`produits/${a.id}`),
    apres: async (a, _r, avant: Doc | null) => {
      const apres = await lire(`produits/${a.id}`);
      return { categorie: "catalogue", action: "update_produit", libelle: `Produit modifié : ${apres?.nom ?? a.nom}`,
        details: differences(avant, apres, { nom: "Nom", rayon: "Famille" }),
        restauration: avant ? { documents: [{ op: "update", chemin: `produits/${a.id}`, data: champsAvant(avant, ["nom", "rayon"]) }] } : null };
    },
  },
  delete_produit: {
    avant: async a => {
      const produit = await lire(`produits/${a.id}`);
      const formats = await chercher("formats", "produit_id", a.id);
      const prix = (await Promise.all(formats.flatMap(f => [chercher("prix_clients", "format_id", f.id), chercher("prix_groupes", "format_id", f.id)]))).flat();
      return { produit, formats, prix };
    },
    apres: async (_a, _r, c: { produit: Doc | null; formats: Doc[]; prix: Doc[] }) => c.produit && ({
      categorie: "catalogue", action: "delete_produit", libelle: `Produit supprimé : ${c.produit.nom}`,
      details: [`${c.formats.length} format(s) : ${c.formats.map(f => `${volumeFr(f.volume, f.unite)} (${casiers(f.stock ?? 0)})`).join(", ") || "aucun"}`, `${c.prix.length} prix client ou groupe`],
      restauration: { documents: [remettre("produits", c.produit), ...c.formats.map(f => remettre("formats", f)),
        ...c.prix.map(p => remettre(p.client_id ? "prix_clients" : "prix_groupes", p))] },
    }),
  },
  create_format: {
    avant: async () => null,
    apres: async (a, id) => ({ categorie: "catalogue", action: "create_format",
      libelle: `Format créé : ${await nomFormat({ produit_id: a.produitId as Id, volume: Number(a.volume), unite: String(a.unite) })}`,
      details: [`Prix comptoir : ${prixOuAFixer(Number(a.prix))}`, `Stock de départ : ${casiers(Number(a.stock) || 0)}`],
      restauration: { documents: [retirer(`formats/${id}`)], avertissement: "Le format sera supprimé, avec le stock qu'il a aujourd'hui." } }),
  },
  update_format: {
    avant: async a => lire(`formats/${a.id}`),
    apres: async (a, _r, avant: Doc | null) => {
      const apres = await lire(`formats/${a.id}`);
      const details = differences(avant, apres, { prix: "Prix comptoir", volume: "Volume", emballage_id: "Casier", seuil_alerte: "Seuil d'alerte" },
        (c, v) => c === "prix" ? prixOuAFixer(v) : String(v ?? "aucun"));
      if (!details.length) return null;
      return { categorie: details.length === 1 && details[0].startsWith("Prix") ? "prix" : "catalogue", action: "update_format",
        libelle: `Format modifié : ${await nomFormat(apres)}`, details,
        restauration: avant ? { documents: [{ op: "update", chemin: `formats/${a.id}`, data: champsAvant(avant, CHAMPS_FORMAT) }] } : null };
    },
  },
  delete_format: {
    avant: async a => {
      const format = await lire(`formats/${a.id}`);
      const prix = [...await chercher("prix_clients", "format_id", a.id), ...await chercher("prix_groupes", "format_id", a.id)];
      return { format, prix, nom: await nomFormat(format) };
    },
    apres: async (_a, _r, c: { format: Doc | null; prix: Doc[]; nom: string }) => c.format && ({
      categorie: "catalogue", action: "delete_format", libelle: `Format supprimé : ${c.nom}`,
      details: [`Stock au moment de la suppression : ${casiers(c.format.stock ?? 0)}`, `Prix comptoir : ${prixOuAFixer(c.format.prix)}`, `${c.prix.length} prix client ou groupe`],
      restauration: { documents: [remettre("formats", c.format), ...c.prix.map(p => remettre(p.client_id ? "prix_clients" : "prix_groupes", p))] },
    }),
  },

  // ── Clients et prix
  create_client: {
    avant: async () => null,
    apres: async (a, id) => ({ categorie: "clients", action: "create_client", libelle: `Client créé : ${a.nom}`, details: [],
      restauration: { documents: [retirer(`clients/${id}`)], avertissement: "La fiche sera supprimée (ses ventes restent dans l'historique)." } }),
  },
  update_client: {
    avant: async a => lire(`clients/${a.id}`),
    apres: async (a, _r, avant: Doc | null) => {
      const apres = await lire(`clients/${a.id}`);
      const details = differences(avant, apres, { nom: "Nom", telephone: "Téléphone", adresse: "Adresse", groupe_prix_id: "Groupe de prix" });
      if (!details.length) return null;
      return { categorie: "clients", action: "update_client", libelle: `Client modifié : ${apres?.nom ?? a.nom}`, details,
        restauration: avant ? { documents: [{ op: "update", chemin: `clients/${a.id}`, data: champsAvant(avant, ["nom", "telephone", "adresse", "groupe_prix_id"]) }] } : null };
    },
  },
  delete_client: {
    avant: async a => ({ client: await lire(`clients/${a.id}`), prix: await chercher("prix_clients", "client_id", a.id) }),
    apres: async (_a, _r, c: { client: Doc | null; prix: Doc[] }) => c.client && ({
      categorie: "clients", action: "delete_client", libelle: `Client supprimé : ${c.client.nom}`, details: [`${c.prix.length} prix propre(s)`],
      restauration: { documents: [remettre("clients", c.client), ...c.prix.map(p => remettre("prix_clients", p))] },
    }),
  },
  set_prix_client: {
    avant: async a => ({ ancien: await lire(`prix_clients/${a.clientId}_${a.formatId}`), client: await lire(`clients/${a.clientId}`), format: await lire(`formats/${a.formatId}`) }),
    apres: async (a, _r, c: { ancien: Doc | null; client: Doc | null; format: Doc | null }) => ({
      categorie: "prix", action: "set_prix_client", libelle: `Prix de ${c.client?.nom ?? "?"} : ${await nomFormat(c.format)}`,
      details: [`${c.ancien ? fcfa(c.ancien.prix) : "prix du groupe ou comptoir"} → ${fcfa(Number(a.prix))}`],
      restauration: { documents: [c.ancien ? remettre("prix_clients", c.ancien) : retirer(`prix_clients/${a.clientId}_${a.formatId}`)] },
    }),
  },
  delete_prix_client: {
    avant: async a => ({ ancien: await lire(`prix_clients/${a.clientId}_${a.formatId}`), client: await lire(`clients/${a.clientId}`), format: await lire(`formats/${a.formatId}`) }),
    apres: async (_a, _r, c: { ancien: Doc | null; client: Doc | null; format: Doc | null }) => c.ancien && ({
      categorie: "prix", action: "delete_prix_client", libelle: `Prix propre retiré à ${c.client?.nom ?? "?"} : ${await nomFormat(c.format)}`,
      details: [`${fcfa(c.ancien.prix)} → prix du groupe ou comptoir`], restauration: { documents: [remettre("prix_clients", c.ancien)] },
    }),
  },
  vider_prix_client: {
    avant: async a => ({ prix: await chercher("prix_clients", "client_id", a.clientId), client: await lire(`clients/${a.clientId}`) }),
    apres: async (_a, _r, c: { prix: Doc[]; client: Doc | null }) => c.prix.length ? ({
      categorie: "prix", action: "vider_prix_client", libelle: `Prix propres effacés : ${c.client?.nom ?? "?"}`, details: [`${c.prix.length} prix`],
      restauration: { documents: c.prix.map(p => remettre("prix_clients", p)) },
    }) : null,
  },
  ajuster_prix_masse: {
    avant: async () => null,
    apres: async (a, res) => {
      if (!a.appliquer) return null;
      const ch = res as { client_id: Id | null; groupe_id?: Id | null; format_id: Id; produit_nom: string; volume: number; unite: string; ancien_prix: number; nouveau_prix: number }[];
      if (!ch.length) return null;
      return { categorie: "prix", action: "ajuster_prix_masse", libelle: `Ajustement des prix : ${ch.length} prix (${a.mode === "pourcentage" ? `${a.valeur} %` : fcfa(Number(a.valeur))})`,
        details: ch.slice(0, 30).map(c => `${c.produit_nom} ${volumeFr(c.volume, c.unite)} : ${fcfa(c.ancien_prix)} → ${fcfa(c.nouveau_prix)}`).concat(ch.length > 30 ? [`… et ${ch.length - 30} autres`] : []),
        restauration: { documents: ch.map(c => c.groupe_id
          ? { op: "update" as const, chemin: `prix_groupes/${c.groupe_id}_${c.format_id}`, data: { prix: c.ancien_prix } }
          : c.client_id === null
            ? { op: "update" as const, chemin: `formats/${c.format_id}`, data: { prix: c.ancien_prix } }
            : { op: "update" as const, chemin: `prix_clients/${c.client_id}_${c.format_id}`, data: { prix: c.ancien_prix } }) } };
    },
  },

  // ── Groupes de prix
  create_groupe_prix: {
    avant: async () => null,
    apres: async (a, id) => ({ categorie: "prix", action: "create_groupe_prix", libelle: `Groupe de prix créé : ${a.nom}`, details: [],
      restauration: { documents: [retirer(`groupes_prix/${id}`)] } }),
  },
  update_groupe_prix: {
    avant: async a => lire(`groupes_prix/${a.id}`),
    apres: async (a, _r, avant: Doc | null) => avant && ({ categorie: "prix", action: "update_groupe_prix", libelle: `Groupe renommé : ${a.nom}`,
      details: [`${avant.nom} → ${a.nom}`], restauration: { documents: [{ op: "update", chemin: `groupes_prix/${a.id}`, data: { nom: avant.nom } }] } }),
  },
  delete_groupe_prix: {
    avant: async a => ({ groupe: await lire(`groupes_prix/${a.id}`), prix: await chercher("prix_groupes", "groupe_id", a.id), membres: await chercher("clients", "groupe_prix_id", a.id) }),
    apres: async (_a, _r, c: { groupe: Doc | null; prix: Doc[]; membres: Doc[] }) => c.groupe && ({
      categorie: "prix", action: "delete_groupe_prix", libelle: `Groupe de prix supprimé : ${c.groupe.nom}`,
      details: [`${c.prix.length} prix`, `${c.membres.length} client(s) : ${c.membres.map(m => m.nom).join(", ") || "aucun"}`],
      restauration: { documents: [remettre("groupes_prix", c.groupe), ...c.prix.map(p => remettre("prix_groupes", p)),
        ...c.membres.map(m => ({ op: "update" as const, chemin: `clients/${m.id}`, data: { groupe_prix_id: c.groupe!.id } }))] },
    }),
  },
  set_prix_groupe: {
    avant: async a => ({ ancien: await lire(`prix_groupes/${a.groupeId}_${a.formatId}`), groupe: await lire(`groupes_prix/${a.groupeId}`), format: await lire(`formats/${a.formatId}`) }),
    apres: async (a, _r, c: { ancien: Doc | null; groupe: Doc | null; format: Doc | null }) => ({
      categorie: "prix", action: "set_prix_groupe", libelle: `Prix du groupe ${c.groupe?.nom ?? "?"} : ${await nomFormat(c.format)}`,
      details: [`${c.ancien ? fcfa(c.ancien.prix) : "prix comptoir"} → ${fcfa(Number(a.prix))}`],
      restauration: { documents: [c.ancien ? remettre("prix_groupes", c.ancien) : retirer(`prix_groupes/${a.groupeId}_${a.formatId}`)] },
    }),
  },
  delete_prix_groupe: {
    avant: async a => ({ ancien: await lire(`prix_groupes/${a.groupeId}_${a.formatId}`), groupe: await lire(`groupes_prix/${a.groupeId}`), format: await lire(`formats/${a.formatId}`) }),
    apres: async (_a, _r, c: { ancien: Doc | null; groupe: Doc | null; format: Doc | null }) => c.ancien && ({
      categorie: "prix", action: "delete_prix_groupe", libelle: `Prix retiré du groupe ${c.groupe?.nom ?? "?"} : ${await nomFormat(c.format)}`,
      details: [`${fcfa(c.ancien.prix)} → prix comptoir`], restauration: { documents: [remettre("prix_groupes", c.ancien)] },
    }),
  },
  set_groupe_client: {
    avant: async a => lire(`clients/${a.clientId}`),
    apres: async (a, _r, avant: Doc | null) => {
      if (!avant || (avant.groupe_prix_id ?? null) === (a.groupeId || null)) return null;
      const nomG = async (id: unknown) => id ? (await lire(`groupes_prix/${id}`))?.nom ?? "?" : "aucun";
      return { categorie: "prix", action: "set_groupe_client", libelle: `Groupe de ${avant.nom}`,
        details: [`${await nomG(avant.groupe_prix_id)} → ${await nomG(a.groupeId)}`],
        restauration: { documents: [{ op: "update", chemin: `clients/${a.clientId}`, data: { groupe_prix_id: avant.groupe_prix_id ?? null } }] } };
    },
  },
  creer_groupe_depuis_client: {
    avant: async a => ({ client: await lire(`clients/${a.clientId}`), prix: await chercher("prix_clients", "client_id", a.clientId) }),
    apres: async (a, groupeId, c: { client: Doc | null; prix: Doc[] }) => c.client && ({
      categorie: "prix", action: "creer_groupe_depuis_client", libelle: `Groupe « ${a.nom} » créé depuis ${c.client.nom}`, details: [`${c.prix.length} prix repris`],
      restauration: { documents: [retirer(`groupes_prix/${groupeId}`), ...c.prix.map(p => retirer(`prix_groupes/${groupeId}_${p.format_id}`)),
        ...c.prix.map(p => remettre("prix_clients", p)), { op: "update", chemin: `clients/${a.clientId}`, data: { groupe_prix_id: c.client.groupe_prix_id ?? null } }] },
    }),
  },

  // ── Fournisseurs
  create_fournisseur: {
    avant: async () => null,
    apres: async (a, id) => ({ categorie: "fournisseurs", action: "create_fournisseur", libelle: `Fournisseur créé : ${a.nom}`, details: [],
      restauration: { documents: [retirer(`fournisseurs/${id}`)] } }),
  },
  update_fournisseur: {
    avant: async a => lire(`fournisseurs/${a.id}`),
    apres: async (a, _r, avant: Doc | null) => {
      const apres = await lire(`fournisseurs/${a.id}`);
      const details = differences(avant, apres, { nom: "Nom", telephone: "Téléphone", adresse: "Adresse" });
      return details.length ? { categorie: "fournisseurs", action: "update_fournisseur", libelle: `Fournisseur modifié : ${apres?.nom ?? a.nom}`, details,
        restauration: avant ? { documents: [{ op: "update", chemin: `fournisseurs/${a.id}`, data: champsAvant(avant, ["nom", "telephone", "adresse"]) }] } : null } : null;
    },
  },
  delete_fournisseur: {
    avant: async a => lire(`fournisseurs/${a.id}`),
    apres: async (_a, _r, avant: Doc | null) => avant && ({ categorie: "fournisseurs", action: "delete_fournisseur", libelle: `Fournisseur supprimé : ${avant.nom}`, details: [],
      restauration: { documents: [remettre("fournisseurs", avant)] } }),
  },
  creer_reception: {
    avant: async a => lire(`fournisseurs/${a.fournisseurId}`),
    apres: async (_a, res, f: Doc | null) => {
      const r = res as { numero: string; total: number; reste_du: number };
      return { categorie: "fournisseurs", action: "creer_reception", libelle: `Livraison ${r.numero} reçue de ${f?.nom ?? "?"}`,
        details: [`Total ${fcfa(r.total)} · reste dû ${fcfa(r.reste_du)}`], restauration: null };
    },
  },
  regler_fournisseur: {
    avant: async a => lire(`fournisseurs/${a.fournisseurId}`),
    apres: async (a, _r, f: Doc | null) => ({ categorie: "fournisseurs", action: "regler_fournisseur", libelle: `Règlement fournisseur : ${f?.nom ?? "?"}`,
      details: [Number(a.montant) > 0 ? `Payé ${fcfa(Number(a.montant))}` : "Casiers rendus"], restauration: null }),
  },

  // ── Stock et casiers
  ajuster_stock: {
    avant: async a => lire(`formats/${a.formatId}`),
    apres: async (a, _r, avant: Doc | null) => {
      if (!avant) return null;
      const nouveau = Number(a.nouveauStock);
      if (nouveau === avant.stock) return null;
      return { categorie: "stock", action: "ajuster_stock", libelle: `Stock corrigé : ${await nomFormat(avant)}`,
        details: [`${casiers(avant.stock)} → ${casiers(nouveau)}`, ...(a.commentaire ? [String(a.commentaire)] : [])],
        restauration: { stock: [{ format_id: avant.id, delta: avant.stock - nouveau }] } };
    },
  },
  reapprovisionner: {
    avant: async a => lire(`formats/${a.formatId}`),
    apres: async (a, _r, avant: Doc | null) => avant && ({ categorie: "stock", action: "reapprovisionner", libelle: `Réapprovisionnement : ${await nomFormat(avant)}`,
      details: [`+${casiers(Number(a.quantite))}`], restauration: { stock: [{ format_id: avant.id, delta: -Number(a.quantite) }] } }),
  },
  valider_comptage_casiers: {
    avant: async a => {
      const pleins = Object.keys((a.pleins ?? {}) as object);
      const vides = Object.keys((a.vides ?? {}) as object);
      return { formats: (await Promise.all(pleins.map(id => lire(`formats/${id}`)))).filter(Boolean) as Doc[], vides: await videsActuels(vides) };
    },
    apres: async (a, _r, c: { formats: Doc[]; vides: Record<Id, number> }) => {
      const lu = (v: unknown) => v === "" || v === null || v === undefined ? null : Number(v);
      const stock = c.formats.map(f => ({ f, n: lu((a.pleins as Record<string, unknown>)[f.id]) })).filter(x => x.n !== null && x.n !== x.f.stock);
      const vides = Object.entries(c.vides).map(([e, avant]) => ({ e, avant, n: lu((a.vides as Record<string, unknown>)[e]) })).filter(x => x.n !== null && x.n !== x.avant);
      if (!stock.length && !vides.length) return null;
      return { categorie: "stock", action: "valider_comptage_casiers", libelle: `Comptage des casiers : ${stock.length + vides.length} écart(s)`,
        details: [...await Promise.all(stock.map(async x => `${await nomFormat(x.f)} : ${x.f.stock} → ${x.n}`)), ...vides.map(x => `Vides ${x.e} : ${x.avant} → ${x.n}`)],
        restauration: { stock: stock.map(x => ({ format_id: x.f.id, delta: x.f.stock - (x.n as number) })), vides: vides.map(x => ({ emballage_id: x.e, delta: x.avant - (x.n as number) })) } };
    },
  },
  retirer_casiers_casses: {
    avant: async () => null,
    apres: async a => ({ categorie: "stock", action: "retirer_casiers_casses", libelle: `Casiers cassés ou perdus : ${a.emballageId}`,
      details: [`−${casiers(Number(a.quantite))}${a.commentaire ? ` · ${a.commentaire}` : ""}`],
      restauration: { vides: [{ emballage_id: a.emballageId as Id, delta: Number(a.quantite) }] } }),
  },
  create_emballage: {
    avant: async () => null,
    apres: async (a, id) => ({ categorie: "parametres", action: "create_emballage", libelle: `Type de casier créé : ${a.nom}`, details: [], restauration: { documents: [retirer(`emballages/${id}`)] } }),
  },
  update_emballage: {
    avant: async a => lire(`emballages/${a.id}`),
    apres: async (a, _r, avant: Doc | null) => avant && ({ categorie: "parametres", action: "update_emballage", libelle: `Type de casier renommé : ${a.nom}`,
      details: [`${avant.nom} → ${a.nom}`], restauration: { documents: [{ op: "update", chemin: `emballages/${a.id}`, data: { nom: avant.nom } }] } }),
  },
  delete_emballage: {
    avant: async a => lire(`emballages/${a.id}`),
    apres: async (_a, _r, avant: Doc | null) => avant && ({ categorie: "parametres", action: "delete_emballage", libelle: `Type de casier supprimé : ${avant.nom}`, details: [],
      restauration: { documents: [remettre("emballages", avant)] } }),
  },

  // ── Ventes et comptes (notés, pas restaurables ici)
  annuler_vente: {
    avant: async a => lire(`ventes/${a.venteId}`),
    apres: async (_a, _r, v: Doc | null) => v && ({ categorie: "ventes", action: "annuler_vente", libelle: `Vente annulée : ${v.numero_facture}`,
      details: [`${v.client_nom} · ${fcfa(v.total)}`], restauration: null }),
  },
  encaisser_paiement: {
    avant: async a => lire(`clients/${a.clientId}`),
    apres: async (a, _r, c: Doc | null) => ({ categorie: "comptes", action: "encaisser_paiement", libelle: `Paiement encaissé : ${c?.nom ?? "?"}`, details: [fcfa(Number(a.montant))], restauration: null }),
  },
  regler_vente: {
    avant: async a => lire(`ventes/${a.venteId}`),
    apres: async (a, _r, v: Doc | null) => v && ({ categorie: "comptes", action: "regler_vente", libelle: `Facture réglée : ${v.numero_facture} · ${v.client_nom}`,
      details: [Number(a.montant) > 0 ? `Payé ${fcfa(Number(a.montant))}` : "",
        ...Object.entries((a.emballages ?? {}) as Record<string, number>).filter(([, n]) => Number(n) > 0).map(([e, n]) => `${casiers(Number(n))} rendus (${e})`)].filter(Boolean),
      restauration: null }),
  },
  cloturer_livraison: {
    avant: async a => lire(`ventes/${a.venteId}`),
    apres: async (a, _r, v: Doc | null) => v && ({ categorie: "comptes", action: "cloturer_livraison",
      libelle: `Retour de livraison : ${v.numero_facture} · ${v.client_nom}`,
      details: [`Reçu ${fcfa(Number(a.montant) || 0)}`,
        ...Object.entries((a.emballages ?? {}) as Record<string, number>).filter(([, n]) => Number(n) > 0).map(([e, n]) => `${casiers(Number(n))} rendus (${e})`)],
      restauration: null }),
  },
  ajouter_dette: {
    avant: async a => lire(`clients/${a.clientId}`),
    apres: async (a, _r, c: Doc | null) => ({ categorie: "comptes", action: "ajouter_dette", libelle: `Dette ajoutée : ${c?.nom ?? "?"}`,
      details: [Number(a.montant) > 0 ? fcfa(Number(a.montant)) : "",
        ...Object.entries((a.emballages ?? {}) as Record<string, number>).filter(([, n]) => Number(n) > 0).map(([e, n]) => `${casiers(Number(n))} dus (${e})`),
        String(a.commentaire ?? "")].filter(Boolean),
      restauration: null }),
  },
  retour_emballages: {
    avant: async a => lire(`clients/${a.clientId}`),
    apres: async (a, _r, c: Doc | null) => ({ categorie: "comptes", action: "retour_emballages", libelle: `Casiers rapportés : ${c?.nom ?? "?"}`,
      details: Object.entries((a.emballages ?? {}) as Record<string, number>).filter(([, n]) => Number(n) > 0).map(([e, n]) => `${casiers(Number(n))} ${e}`), restauration: null }),
  },

  // ── Comptes et paramètres
  update_utilisateur: {
    avant: async a => lire(`users/${a.uid}`),
    apres: async (a, _r, avant: Doc | null) => {
      const details = differences(avant, { nom: a.nom, role: a.role, actif: a.actif !== false }, { nom: "Nom", role: "Rôle", actif: "Actif" },
        (c, v) => c === "actif" ? (v ? "oui" : "non") : String(v ?? "—"));
      return details.length && avant ? { categorie: "utilisateurs", action: "update_utilisateur", libelle: `Compte modifié : ${avant.nom}`, details,
        restauration: { documents: [{ op: "update", chemin: `users/${a.uid}`, data: champsAvant(avant, ["nom", "role", "actif"]) }] } } : null;
    },
  },
  create_utilisateur: {
    avant: async () => null,
    apres: async a => ({ categorie: "utilisateurs", action: "create_utilisateur", libelle: `Compte créé : ${a.nom}`, details: [`Rôle : ${a.role}`],
      restauration: null }),
  },
  update_parametres: {
    avant: async () => lire("parametres/general"),
    apres: async (_a, _r, avant: Doc | null) => {
      const apres = await lire("parametres/general");
      const champs = { nom_commerce: "Nom du commerce", adresse_commerce: "Adresse", telephone_commerce: "Téléphone", email_commerce: "E-mail", devise: "Devise", symbole_devise: "Symbole" };
      const details = differences(avant, apres, champs);
      return details.length ? { categorie: "parametres", action: "update_parametres", libelle: "Paramètres du commerce modifiés", details,
        restauration: { documents: [{ op: "update", chemin: "parametres/general", data: champsAvant(avant, Object.keys(champs)) }] } } : null;
    },
  },
};

// ── Restauration ──────────────────────────────────────────────────────────

// Seules ces collections peuvent être réécrites par une restauration
const COLLECTIONS_RESTAURABLES = ["produits", "formats", "clients", "prix_clients", "prix_groupes", "groupes_prix", "fournisseurs", "emballages", "users", "parametres"];

export const journal: Record<string, Commande> = {
  get_journal: async ({ categorie }) => {
    const entrees = await lister<EntreeJournal>(query(col("journal"), orderBy("date", "desc"), limit(300)));
    return categorie ? entrees.filter(e => e.categorie === categorie) : entrees;
  },

  /** Remet les choses comme avant l'action (admin), puis note la restauration elle-même. */
  restaurer_action: async ({ id }) => {
    const e = await lire(`journal/${id}`) as (EntreeJournal & Doc) | null;
    if (!e) throw new Error("Action introuvable.");
    if (e.restaure_le) throw new Error("Cette action a déjà été restaurée.");
    const r = e.restauration;
    if (!r) throw new Error("Cette action ne peut pas être restaurée ici.");

    const batch = writeBatch(db);
    for (const o of r.documents ?? []) {
      const [collection] = o.chemin.split("/");
      if (!COLLECTIONS_RESTAURABLES.includes(collection)) throw new Error("Restauration non autorisée.");
      const ref = doc(db, o.chemin);
      if (o.op === "delete") batch.delete(ref);
      else if (o.op === "set") batch.set(ref, o.data ?? {});
      else {
        // Un document disparu depuis ne peut pas être « remis » champ par champ
        if (!(await getDoc(ref)).exists()) throw new Error("Un élément concerné a été supprimé depuis : restaurez d'abord sa suppression.");
        batch.update(ref, o.data ?? {});
      }
    }
    // Stock : mouvement inverse sur le stock d'aujourd'hui (il a pu bouger depuis)
    for (const s of r.stock ?? []) {
      const snap = await getDoc(doc(db, "formats", s.format_id));
      if (!snap.exists()) throw new Error("Un format concerné a été supprimé depuis.");
      const f = { id: snap.id, ...snap.data() } as Format;
      const p = await getDoc(doc(db, "produits", f.produit_id));
      const m = ajouterMouvement(batch, f, (p.data()?.nom as string) ?? "—", {
        type: "ajustement", quantite: Math.abs(s.delta), stock_apres: f.stock + s.delta, source: "inventaire", commentaire: `Restauration : ${e.libelle}`,
      });
      batch.update(snap.ref, { stock: increment(s.delta), dernier_mouvement: m });
    }
    if (r.vides?.length) {
      const actuels = await videsActuels(r.vides.map(v => v.emballage_id));
      for (const v of r.vides) if (v.emballage_id in actuels) mouvementVides(batch, v.emballage_id, v.delta, actuels[v.emballage_id], { source: "inventaire", commentaire: `Restauration : ${e.libelle}` });
    }
    const qui = useAuthStore.getState().profil?.nom ?? "";
    batch.update(doc(db, "journal", id as Id), { restaure_le: maintenant(), restaure_par: qui });
    await ecrire(batch.commit());
    await journaliser({ categorie: e.categorie, action: "restauration", libelle: `Restauré : ${e.libelle}`, details: e.details, restauration: null });
  },
};

