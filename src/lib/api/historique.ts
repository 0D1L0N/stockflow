import { doc, getDoc, increment, orderBy, query, serverTimestamp, where, writeBatch } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { useAuthStore } from "@/stores/authStore";
import { col, ecrire, lister, maintenant, type Commande, type Id } from "./outils";
import { listerFormats, listerProduits } from "./catalogue";
import { appliquerAuCompte, nouvelleOperation } from "./comptes";
import { listerEmballages } from "./emballages";
import { mouvementsVides } from "./casiers";

interface ArticleVente {
  format_id: Id; produit_id: Id; produit_nom: string; volume: number; unite: string;
  casier?: number | null;
  quantite: number; prix_utilise: number;
}
interface VenteDoc {
  id: Id; numero_facture: string; date: string; client_id: Id; client_nom: string;
  total: number; montant_recu: number | null; monnaie_rendue: number | null;
  statut: string; items: ArticleVente[];
  montant_paye?: number; reste_du?: number;
  emballages_livres?: Record<string, number>; emballages_rendus?: Record<string, number>;
  solde_avant?: { argent: number; emballages: Record<string, number> };
}

/** Champs renvoyés aux pages, comme l'ancienne commande Rust. */
const resume = (v: VenteDoc) => ({
  id: v.id, numero_facture: v.numero_facture, date: v.date, client_id: v.client_id,
  client_nom: v.client_nom, total: v.total, montant_recu: v.montant_recu,
  monnaie_rendue: v.monnaie_rendue, statut: v.statut,
  montant_paye: v.montant_paye ?? v.total, reste_du: v.reste_du ?? 0,
  emballages_livres: v.emballages_livres ?? {}, emballages_rendus: v.emballages_rendus ?? {},
  solde_avant: v.solde_avant ?? null,
});

/** Date locale "AAAA-MM-JJ" décalée de n jours. */
function jourLocal(decalage = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + decalage);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const historique: Record<string, Commande> = {
  get_ventes: async ({ dateDebut, dateFin, clientId }) => {
    const debut = (dateDebut as string | null) || "2000-01-01";
    const fin = `${(dateFin as string | null) || "2099-12-31"} 23:59:59`;
    const profil = useAuthStore.getState().profil;

    // Un vendeur ne peut lire que ses propres ventes (règles Firestore) : la requête
    // doit donc filtrer sur vendeur_uid. Les dates sont alors filtrées ici, pour
    // éviter un index composite.
    const ventes = profil?.role === "gerant"
      ? await lister<VenteDoc>(query(col("ventes"),
          where("date", ">=", debut), where("date", "<=", fin), orderBy("date", "desc")))
      : await lister<VenteDoc>(query(col("ventes"), where("vendeur_uid", "==", auth.currentUser?.uid ?? "")));

    return ventes
      .filter(v => v.date >= debut && v.date <= fin)
      .filter(v => !clientId || v.client_id === clientId)
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(resume);
  },

  get_vente_details: async ({ venteId }) => {
    const snap = await getDoc(doc(db, "ventes", venteId as Id));
    if (!snap.exists()) throw new Error("Vente introuvable");
    const v = { id: snap.id, ...snap.data() } as VenteDoc;
    return {
      vente: resume(v),
      details: v.items.map((a, i) => ({
        id: `${v.id}-${i}`, vente_id: v.id, format_id: a.format_id,
        produit_nom: a.produit_nom, volume: a.volume, unite: a.unite, casier: a.casier ?? null,
        quantite: a.quantite, prix_utilise: a.prix_utilise,
      })),
    };
  },

  /** Annule une vente : remet le stock, trace les mouvements et corrige les stats du jour. */
  annuler_vente: async ({ venteId }) => {
    const snap = await getDoc(doc(db, "ventes", venteId as Id));
    if (!snap.exists()) throw new Error("Vente introuvable");
    const v = { id: snap.id, ...snap.data() } as VenteDoc;
    if (v.statut === "annulée") throw new Error("Cette vente est déjà annulée.");

    const date = maintenant();
    const formats = await Promise.all(v.items.map(a => getDoc(doc(db, "formats", a.format_id))));
    const batch = writeBatch(db);
    batch.update(snap.ref, { statut: "annulée", date_annulation: date });

    const quantites: Record<string, unknown> = {};
    v.items.forEach((a, i) => {
      const stockAvant = (formats[i].data()?.stock as number | undefined) ?? 0;
      if (formats[i].exists()) batch.update(formats[i].ref, { stock: increment(a.quantite) });
      batch.set(doc(col("mouvements_stock")), {
        format_id: a.format_id, produit_nom: a.produit_nom, volume: a.volume, unite: a.unite, casier: a.casier ?? null,
        type: "entrée", quantite: a.quantite, stock_avant: stockAvant, stock_apres: stockAvant + a.quantite,
        source: "vente", reference_id: v.id, commentaire: "Annulation vente",
        utilisateur_uid: auth.currentUser?.uid, date, cree_le: serverTimestamp(),
      });
      quantites[a.format_id] = increment(-a.quantite);
    });

    // Les stats sont rattachées au jour de la vente, pas au jour de l'annulation
    batch.set(doc(db, "stats_jour", v.date.slice(0, 10)), {
      ca: increment(-v.total), nb_ventes: increment(-1), quantites,
    }, { merge: true });

    // Annule aussi ce que la vente avait ajouté au compte du client
    // (les ventes antérieures à la gestion des comptes n'ont pas ces champs)
    const resteDu = v.reste_du ?? 0;
    const casiers: Record<string, number> = {};
    for (const e of new Set([...Object.keys(v.emballages_livres ?? {}), ...Object.keys(v.emballages_rendus ?? {})])) {
      const d = (v.emballages_livres?.[e] ?? 0) - (v.emballages_rendus?.[e] ?? 0);
      if (d !== 0) casiers[e] = -d;
    }
    const client = await getDoc(doc(db, "clients", v.client_id));
    if (client.exists() && client.data().est_defaut !== 1 && (resteDu !== 0 || Object.keys(casiers).length)) {
      const op = nouvelleOperation();
      appliquerAuCompte(batch, v.client_id, client.data(), -resteDu, casiers, op.id);
      batch.set(op, {
        cree_le: serverTimestamp(),
        client_id: v.client_id, client_nom: v.client_nom, type: "annulation",
        vente_id: v.id, numero_facture: v.numero_facture, montant: -resteDu, emballages: casiers,
        commentaire: "Annulation de la vente", date,
        utilisateur_uid: auth.currentUser?.uid, utilisateur_nom: useAuthStore.getState().profil?.nom ?? "",
      });
    }

    // Les vides que le client avait rapportés ressortent du magasin
    await mouvementsVides(batch,
      Object.fromEntries(Object.entries(v.emballages_rendus ?? {}).map(([e, n]) => [e, -n])),
      { source: "annulation", reference_id: v.id, commentaire: v.numero_facture });

    await ecrire(batch.commit());
  },

  get_stats_dashboard: async () => {
    // Les 7 derniers jours (aujourd'hui inclus) pour le graphique du tableau de bord
    const jours = Array.from({ length: 7 }, (_, i) => jourLocal(i - 6));
    const semaine = Promise.all(jours.map(j => getDoc(doc(db, "stats_jour", j))))
      .then(snaps => snaps.map((s, i) => ({ jour: jours[i], ca: (s.data()?.ca as number) ?? 0, ventes: (s.data()?.nb_ventes as number) ?? 0 })));
    const [aujourdhui, hier, produits, formats, clients, emballages, sept] = await Promise.all([
      getDoc(doc(db, "stats_jour", jourLocal(0))),
      getDoc(doc(db, "stats_jour", jourLocal(-1))),
      listerProduits(),
      listerFormats(undefined, true), // ventes du jour d'un format retiré comprises
      lister<{ id: Id; solde_argent?: number; emballages_dus?: Record<string, number> }>(col("clients")),
      listerEmballages(),
      semaine,
    ]);

    // Ce que les clients doivent au dépôt
    const debiteurs = clients.filter(c => (c.solde_argent ?? 0) > 0);
    const dehors = new Map<string, number>();
    for (const c of clients) {
      for (const [e, n] of Object.entries(c.emballages_dus ?? {})) if (n > 0) dehors.set(e, (dehors.get(e) ?? 0) + n);
    }
    const emballages_dehors = emballages
      .filter(e => dehors.has(e.id))
      .map(e => ({ nom: e.nom, quantite: dehors.get(e.id)! }));
    const jour = aujourdhui.data() ?? {};

    // Top 3 des produits vendus aujourd'hui (quantités regroupées par produit)
    const produitDuFormat = new Map(formats.map(f => [f.id, f.produit_id]));
    const nomProduit = new Map(produits.map(p => [p.id, p.nom]));
    const parProduit = new Map<string, number>();
    for (const [formatId, q] of Object.entries((jour.quantites ?? {}) as Record<string, number>)) {
      const produitId = produitDuFormat.get(formatId);
      if (!produitId || q <= 0) continue;
      parProduit.set(produitId, (parProduit.get(produitId) ?? 0) + q);
    }
    const top_produits = [...parProduit.entries()]
      .map(([id, total_vendu]) => ({ produit_nom: nomProduit.get(id) ?? "?", total_vendu }))
      .sort((a, b) => b.total_vendu - a.total_vendu)
      .slice(0, 3);

    return {
      ca_jour: (jour.ca as number) ?? 0,
      ca_hier: (hier.data()?.ca as number) ?? 0,
      ventes_jour: (jour.nb_ventes as number) ?? 0,
      formats_en_alerte: formats.filter(f => f.stock <= f.seuil_alerte).length,
      total_produits: produits.length,
      top_produits,
      total_dettes: debiteurs.reduce((s, c) => s + (c.solde_argent ?? 0), 0),
      clients_debiteurs: debiteurs.length,
      emballages_dehors,
      semaine: sept,
    };
  },
};
