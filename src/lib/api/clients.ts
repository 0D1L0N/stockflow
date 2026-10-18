import { deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { col, ecrire, lister, maintenant, parNom, type Commande, type Id } from "./outils";
import { listerFormats, listerProduits } from "./catalogue";
import { volumeFr } from "@/lib/format";
import { FAMILLES, familleDe } from "@/lib/familles";

export interface Client {
  id: Id; nom: string; telephone: string | null; adresse: string | null;
  est_defaut: number; date_creation: string | null;
}

/** Client utilisé par défaut pour les ventes au comptoir. */
export const CLIENT_DEFAUT: Id = "defaut";

const idPrix = (clientId: Id, formatId: Id) => `${clientId}_${formatId}`;

async function assurerClientDefaut(): Promise<Client | null> {
  const ref = doc(db, "clients", CLIENT_DEFAUT);
  const snap = await getDoc(ref);
  if (snap.exists()) return { id: snap.id, ...snap.data() } as Client;
  const client = { nom: "Client standard", telephone: null, adresse: null, est_defaut: 1, date_creation: maintenant() };
  await ecrire(setDoc(ref, client));
  return { id: CLIENT_DEFAUT, ...client };
}

/** Arrondit au multiple donné, vers le haut pour une hausse et vers le bas pour une baisse. */
function arrondir(prix: number, multiple: number, versLeHaut: boolean): number {
  if (multiple <= 0) return Math.round(prix * 100) / 100;
  const q = prix / multiple;
  // Petite tolérance pour éviter 500.0000001 → 525
  return (versLeHaut ? Math.ceil(q - 1e-9) : Math.floor(q + 1e-9)) * multiple;
}

interface ChangementPrix {
  client_id: Id | null; client_nom: string | null; format_id: Id;
  produit_nom: string; volume: number; unite: string;
  ancien_prix: number; nouveau_prix: number;
}

export const clients: Record<string, Commande> = {
  get_clients: async () => {
    const tous = await lister<Client>(col("clients"));
    if (!tous.some(c => c.est_defaut === 1)) {
      const defaut = await assurerClientDefaut().catch(() => null);
      if (defaut) tous.push(defaut);
    }
    return tous.sort((a, b) => (b.est_defaut - a.est_defaut) || parNom(a, b));
  },

  create_client: async ({ nom, telephone, adresse }) => {
    const ref = doc(col("clients"));
    await ecrire(setDoc(ref, {
      nom: String(nom).trim(), telephone: telephone ?? null, adresse: adresse ?? null,
      est_defaut: 0, date_creation: maintenant(),
    }));
    return ref.id;
  },

  update_client: async ({ id, nom, telephone, adresse }) => {
    await ecrire(updateDoc(doc(db, "clients", id as Id), {
      nom: String(nom).trim(), telephone: telephone ?? null, adresse: adresse ?? null,
    }));
  },

  delete_client: async ({ id }) => {
    if (id === CLIENT_DEFAUT) throw new Error("Le client standard ne peut pas être supprimé.");
    // Les ventes passées restent dans l'historique (elles portent le nom du client) ;
    // on refuse seulement si le client doit encore de l'argent ou des casiers.
    const fiche = (await getDoc(doc(db, "clients", id as Id))).data() ?? {};
    if (((fiche.solde_argent as number) ?? 0) !== 0)
      throw new Error("Impossible de supprimer : le compte de ce client n'est pas soldé.");
    if (Object.values((fiche.emballages_dus ?? {}) as Record<string, number>).some(n => n !== 0))
      throw new Error("Impossible de supprimer : ce client doit encore des casiers.");
    const batch = writeBatch(db);
    (await getDocs(query(col("prix_clients"), where("client_id", "==", id)))).docs.forEach(d => batch.delete(d.ref));
    batch.delete(doc(db, "clients", id as Id));
    await ecrire(batch.commit());
  },

  // ── Prix par client ──────────────────────────────────────────────────

  /** Tous les formats avec, pour chacun, le prix spécifique du client s'il existe. */
  get_prix_client: async ({ clientId }) => {
    const [produits, formats, prixSnap] = await Promise.all([
      listerProduits(),
      listerFormats(),
      getDocs(query(col("prix_clients"), where("client_id", "==", clientId))),
    ]);
    const noms = new Map(produits.map(p => [p.id, p.nom]));
    const rayons = new Map(produits.map(p => [p.id, p.rayon ?? null]));
    const prix = new Map(prixSnap.docs.map(d => [d.data().format_id as Id, d.data()]));
    const ordre = (cle: string) => FAMILLES.findIndex(f => f.cle === cle);
    return formats
      .map(f => ({
        famille: familleDe(f.emballage_id, rayons.get(f.produit_id)),
        format_id: f.id, produit_id: f.produit_id, produit_nom: noms.get(f.produit_id) ?? "?",
        volume: f.volume, unite: f.unite, prix_base: f.prix,
        prix_client: (prix.get(f.id)?.prix as number | undefined) ?? null,
        date_maj: (prix.get(f.id)?.date_maj as string | undefined) ?? null,
      }))
      .sort((a, b) => ordre(a.famille) - ordre(b.famille) || a.produit_nom.localeCompare(b.produit_nom, "fr") || a.volume - b.volume);
  },

  set_prix_client: async ({ clientId, formatId, prix }) => {
    const p = Number(prix);
    if (!(p > 0)) throw new Error("Le prix doit être supérieur à 0.");
    await ecrire(setDoc(doc(db, "prix_clients", idPrix(clientId as Id, formatId as Id)), {
      client_id: clientId, format_id: formatId, prix: p, date_maj: maintenant(),
    }));
  },

  /** Supprime le prix spécifique : le client repasse au prix de base. */
  delete_prix_client: async ({ clientId, formatId }) => {
    await ecrire(deleteDoc(doc(db, "prix_clients", idPrix(clientId as Id, formatId as Id))));
  },

  /**
   * Hausse (ou baisse) des prix en masse.
   * portee : "base" | "clients" | "tous" ; mode : "pourcentage" | "montant" ;
   * appliquer = false → simple aperçu, rien n'est modifié.
   */
  ajuster_prix_masse: async ({ portee, clientId, produitId, mode, valeur, arrondi, appliquer }) => {
    if (!["base", "clients", "tous"].includes(portee as string)) throw new Error(`Portée inconnue : ${portee}`);
    if (mode !== "pourcentage" && mode !== "montant") throw new Error(`Mode inconnu : ${mode}`);
    const v = Number(valeur), multiple = Number(arrondi) || 0;

    const [produits, formats, clientsListe, prixSnap] = await Promise.all([
      listerProduits(), listerFormats(), lister<Client>(col("clients")),
      portee === "base" ? null : getDocs(clientId
        ? query(col("prix_clients"), where("client_id", "==", clientId))
        : col("prix_clients")),
    ]);
    const noms = new Map(produits.map(p => [p.id, p.nom]));
    const nomsClients = new Map(clientsListe.map(c => [c.id, c.nom]));
    const formatsParId = new Map(formats.map(f => [f.id, f]));
    const garder = (produit: Id) => !produitId || produit === produitId;

    const changements: ChangementPrix[] = [];
    if (portee !== "clients") {
      for (const f of formats) {
        if (!garder(f.produit_id)) continue;
        changements.push({ client_id: null, client_nom: null, format_id: f.id, produit_nom: noms.get(f.produit_id) ?? "?",
          volume: f.volume, unite: f.unite, ancien_prix: f.prix, nouveau_prix: 0 });
      }
    }
    for (const d of prixSnap?.docs ?? []) {
      const pc = d.data();
      const f = formatsParId.get(pc.format_id);
      if (!f || !garder(f.produit_id)) continue;
      changements.push({ client_id: pc.client_id, client_nom: nomsClients.get(pc.client_id) ?? "?", format_id: f.id,
        produit_nom: noms.get(f.produit_id) ?? "?", volume: f.volume, unite: f.unite, ancien_prix: pc.prix, nouveau_prix: 0 });
    }

    for (const c of changements) {
      const brut = mode === "pourcentage" ? c.ancien_prix * (1 + v / 100) : c.ancien_prix + v;
      c.nouveau_prix = arrondir(brut, multiple, v >= 0);
      if (c.nouveau_prix <= 0) {
        throw new Error(`Le nouveau prix de ${c.produit_nom} ${volumeFr(c.volume, c.unite)} serait négatif ou nul.`);
      }
    }

    if (appliquer) {
      // Un batch Firestore est limité à 500 opérations
      for (let i = 0; i < changements.length; i += 450) {
        const batch = writeBatch(db);
        for (const c of changements.slice(i, i + 450)) {
          if (c.client_id === null) batch.update(doc(db, "formats", c.format_id), { prix: c.nouveau_prix });
          else batch.update(doc(db, "prix_clients", idPrix(c.client_id, c.format_id)), { prix: c.nouveau_prix, date_maj: maintenant() });
        }
        await ecrire(batch.commit());
      }
    }

    // Même ordre que l'ancienne version : prix de base, puis par client
    return changements.sort((a, b) =>
      (a.client_nom ?? "").localeCompare(b.client_nom ?? "", "fr")
      || a.produit_nom.localeCompare(b.produit_nom, "fr") || a.volume - b.volume);
  },
};
