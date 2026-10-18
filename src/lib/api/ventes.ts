import { doc, getDoc, increment, serverTimestamp, writeBatch } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { useAuthStore } from "@/stores/authStore";
import { col, ecrire, maintenant, type Commande, type Id } from "./outils";
import type { Format } from "./catalogue";
import { appliquerAuCompte, nouvelleOperation, type SoldesClient } from "./comptes";
import { mouvementsVides } from "./casiers";
import { volumeFr } from "@/lib/format";

interface VenteItemArg { formatId: Id; quantite: number; prixUtilise: number; }

// ── Numérotation des factures hors ligne ──────────────────────────────────
// Deux appareils hors ligne ne peuvent pas se coordonner : chacun a donc
// son propre préfixe et son propre compteur journalier.
// Format : FACT-AAAAMMJJ-<appareil>-NNNN

function lireStockage(cle: string): string | null {
  try { return localStorage.getItem(cle); } catch { return null; }
}
function ecrireStockage(cle: string, valeur: string) {
  try { localStorage.setItem(cle, valeur); } catch { /* stockage indisponible */ }
}

function prefixeAppareil(): string {
  let p = lireStockage("stockflow.appareil");
  if (!p) {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans 0/O ni 1/I
    p = Array.from({ length: 3 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
    ecrireStockage("stockflow.appareil", p);
  }
  return p;
}

function prochainNumeroFacture(jour: string): string {
  const cle = `stockflow.factures.${jour}`;
  const n = (parseInt(lireStockage(cle) ?? "0", 10) || 0) + 1;
  ecrireStockage(cle, String(n));
  return `FACT-${jour}-${prefixeAppareil()}-${String(n).padStart(4, "0")}`;
}

export const ventes: Record<string, Commande> = {
  create_vente: async ({ clientId, items, montantRecu, montantPaye, emballagesRendus }) => {
    const lignes = items as VenteItemArg[];
    if (!lignes?.length) throw new Error("La vente doit contenir au moins un article.");
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Session expirée : reconnectez-vous.");

    // Hors ligne, getDoc lit le cache local : le stock vérifié est le dernier connu.
    const formats = await Promise.all(lignes.map(async l => {
      const snap = await getDoc(doc(db, "formats", l.formatId));
      if (!snap.exists()) throw new Error("Un article du panier n'existe plus.");
      return { id: snap.id, ...snap.data() } as Format;
    }));
    const produits = await Promise.all(formats.map(f => getDoc(doc(db, "produits", f.produit_id))));
    const client = await getDoc(doc(db, "clients", clientId as Id));

    lignes.forEach((l, i) => {
      const f = formats[i];
      if (f.stock < l.quantite) {
        throw new Error(`Stock insuffisant pour ${produits[i].data()?.nom ?? "un article"} ${volumeFr(f.volume, f.unite)} (disponible : ${f.stock}, demandé : ${l.quantite})`);
      }
    });

    const total = lignes.reduce((s, l) => s + l.quantite * l.prixUtilise, 0);
    const recu = montantRecu == null ? null : Number(montantRecu);
    const monnaieRendue = recu == null ? null : Math.max(0, recu - total);

    const clientData = client.data() ?? {};
    const clientNomme = client.exists() && clientData.est_defaut !== 1;
    const soldeAvant = {
      argent: clientNomme ? ((clientData.solde_argent as number) ?? 0) : 0,
      emballages: clientNomme ? { ...((clientData.emballages_dus ?? {}) as Record<string, number>) } : {},
    };

    // Paiement : par défaut l'achat est payé en entier. Le client peut payer moins
    // (le reste devient une dette) ou plus, pour régler une ancienne dette.
    const maxPayable = total + Math.max(0, soldeAvant.argent);
    const paye = montantPaye == null ? total : Math.min(maxPayable, Math.max(0, Number(montantPaye)));
    // Variation de la dette : positive = le client doit davantage, négative = il rembourse
    const resteDu = total - paye;

    // Casiers livrés (1 casier vendu = 1 casier consigné) et casiers rendus sur place
    const livres: Record<string, number> = {};
    lignes.forEach((l, i) => {
      const e = formats[i].emballage_id;
      if (e) livres[e] = (livres[e] ?? 0) + l.quantite;
    });
    const rendus: Record<string, number> = {};
    for (const [e, n] of Object.entries((emballagesRendus ?? {}) as Record<string, number>)) {
      const q = Math.trunc(Number(n));
      if (q < 0) throw new Error("Le nombre de casiers rendus ne peut pas être négatif.");
      if (q > 0) rendus[e] = q;
    }
    const ecartEmballages: Record<string, number> = {};
    for (const e of new Set([...Object.keys(livres), ...Object.keys(rendus)])) {
      const d = (livres[e] ?? 0) - (rendus[e] ?? 0);
      if (d !== 0) ecartEmballages[e] = d;
    }

    const laisseUneDette = resteDu > 0 || Object.values(ecartEmballages).some(d => d > 0);
    if (laisseUneDette && !clientNomme) {
      throw new Error("Un reste à payer ou des casiers non rendus doivent être rattachés à un client nommé.");
    }
    // Au comptoir, rendre plus de casiers que livrés n'a pas de compte à créditer
    if (!clientNomme) for (const e of Object.keys(ecartEmballages)) delete ecartEmballages[e];
    const date = maintenant();
    const jour = date.slice(0, 10);
    const numeroFacture = prochainNumeroFacture(jour.replace(/-/g, ""));
    const profil = useAuthStore.getState().profil;

    const venteRef = doc(col("ventes"));
    const batch = writeBatch(db);
    const articles = lignes.map((l, i) => ({
      format_id: l.formatId,
      produit_id: formats[i].produit_id,
      produit_nom: (produits[i].data()?.nom as string) ?? "—",
      volume: formats[i].volume,
      unite: formats[i].unite,
      quantite: l.quantite,
      prix_utilise: l.prixUtilise,
    }));

    batch.set(venteRef, {
      numero_facture: numeroFacture,
      date,
      client_id: clientId,
      client_nom: (client.data()?.nom as string) ?? "Client",
      total,
      montant_recu: recu,
      monnaie_rendue: monnaieRendue,
      montant_paye: paye,
      reste_du: resteDu,
      emballages_livres: livres,
      emballages_rendus: rendus,
      // Soldes du client juste avant cette vente (pour l'addition sur la facture)
      solde_avant: soldeAvant,
      cree_le: serverTimestamp(),
      statut: "validée",
      vendeur_uid: uid,
      vendeur_nom: profil?.nom ?? "",
      items: articles,
      format_ids: [...new Set(articles.map(a => a.format_id))],
    });

    lignes.forEach((l, i) => {
      // increment : deux ventes simultanées sur deux appareils s'additionnent sans se perdre
      batch.update(doc(db, "formats", l.formatId), { stock: increment(-l.quantite), derniere_vente: venteRef.id });
      batch.set(doc(col("mouvements_stock")), {
        format_id: l.formatId,
        produit_nom: articles[i].produit_nom,
        volume: articles[i].volume,
        unite: articles[i].unite,
        type: "sortie",
        quantite: l.quantite,
        stock_avant: formats[i].stock,
        stock_apres: formats[i].stock - l.quantite,
        source: "vente",
        reference_id: venteRef.id,
        commentaire: null,
        utilisateur_uid: uid,
        date,
        cree_le: serverTimestamp(),
      });
    });

    // Totaux du jour pré-calculés pour le dashboard (évite de relire toutes les ventes)
    const quantites: Record<string, unknown> = {};
    for (const l of lignes) quantites[l.formatId] = increment(l.quantite);
    batch.set(doc(db, "stats_jour", jour), {
      ca: increment(total), nb_ventes: increment(1), quantites, derniere_vente: venteRef.id,
    }, { merge: true });

    // Comptes du client : dette d'argent et casiers à rendre, plus la trace dans le journal
    let soldes: SoldesClient | null = null;
    if (clientNomme) {
      const op = nouvelleOperation();
      soldes = appliquerAuCompte(batch, clientId as Id, clientData, resteDu, ecartEmballages, op.id);
      batch.set(op, {
        cree_le: serverTimestamp(),
        client_id: clientId, client_nom: clientData.nom ?? "Client",
        type: "vente", vente_id: venteRef.id, numero_facture: numeroFacture,
        montant_total: total, montant_paye: paye, montant: resteDu,
        emballages: ecartEmballages, emballages_livres: livres, emballages_rendus: rendus,
        commentaire: null, date, utilisateur_uid: uid, utilisateur_nom: profil?.nom ?? "",
      });
    }

    // Les vides rapportés par le client rentrent au magasin (au comptoir aussi)
    await mouvementsVides(batch, rendus, { source: "vente", reference_id: venteRef.id, commentaire: numeroFacture });

    await ecrire(batch.commit());
    return {
      id: venteRef.id, numero_facture: numeroFacture, total, monnaie_rendue: monnaieRendue,
      montant_paye: paye, reste_du: resteDu, emballages_livres: livres, emballages_rendus: rendus,
      solde_avant: soldeAvant, soldes,
    };
  },
};
