/**
 * Tests des règles de sécurité Firestore, sur l'émulateur local (aucune donnée réelle).
 * Lancer : npm run test:regles
 *
 * On vérifie que le vendeur peut travailler normalement, mais qu'il ne peut
 * ni modifier un stock, ni une dette, ni les totaux du jour sans « preuve »
 * (vente, mouvement ou opération de journal créée dans le même batch).
 */
import { readFileSync } from "fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  deleteDoc, doc, getDoc, increment, serverTimestamp, setDoc, updateDoc, writeBatch, type Firestore,
} from "firebase/firestore";

let env: RulesTestEnvironment;
const JOUR = "2026-10-18";

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-stockflow",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
});
afterAll(async () => { await env.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users/gerant"), { nom: "G", role: "gerant", actif: true });
    await setDoc(doc(db, "users/vendeur"), { nom: "V", role: "vendeur", actif: true });
    await setDoc(doc(db, "users/autre"), { nom: "A", role: "vendeur", actif: true });
    await setDoc(doc(db, "users/ancien"), { nom: "X", role: "vendeur", actif: false });
    await setDoc(doc(db, "formats/f1"), { produit_id: "p1", volume: 0.33, unite: "L", prix: 6000, stock: 10, seuil_alerte: 2 });
    await setDoc(doc(db, "formats/f9"), { produit_id: "p9", volume: 0.33, unite: "L", prix: 6000, stock: 10, seuil_alerte: 2 });
    await setDoc(doc(db, "clients/c1"), { nom: "Client", est_defaut: 0, solde_argent: 5000, emballages_dus: { "casier-24": 2 } });
    await setDoc(doc(db, "clients/c2"), { nom: "Autre client", est_defaut: 0 });
    await setDoc(doc(db, `stats_jour/${JOUR}`), { ca: 100, nb_ventes: 1 });
    await setDoc(doc(db, "fournisseurs/fo1"), { nom: "Fournisseur", solde_argent: 0 });
    await setDoc(doc(db, "commandes_fournisseur/cmd1"), { fournisseur_id: "fo1", lignes: [{ format_id: "f1", quantite: 5 }], statut: "envoyée", reception_id: null });
    await setDoc(doc(db, "commandes_fournisseur/cmd-recue"), { fournisseur_id: "fo1", lignes: [{ format_id: "f1", quantite: 5 }], statut: "reçue", reception_id: "r0" });
    await setDoc(doc(db, "receptions/r0"), { utilisateur_uid: "vendeur", fournisseur_id: "fo1", total: 1000 });
    await setDoc(doc(db, "ventes/v-autre"), { vendeur_uid: "autre", total: 1, statut: "validée", format_ids: [] });
    await setDoc(doc(db, "emballages/casier-24"), { nom: "Casier 24", ordre: 1, stock_vides: 10 });
    await setDoc(doc(db, "emballages/casier-12"), { nom: "Casier 12", ordre: 3 });
  });
});

const en = (uid: string) => env.authenticatedContext(uid).firestore();

/** Vente complète telle que l'application l'écrit (2 casiers, 6 000 payés sur 12 000). */
function batchVente(db: Firestore, uid: string, opts: { total?: number; ca?: number; formatStock?: number } = {}) {
  const total = opts.total ?? 12000;
  const b = writeBatch(db);
  b.set(doc(db, "ventes/v1"), {
    vendeur_uid: uid, statut: "validée", total, client_id: "c1",
    format_ids: ["f1"], items: [], cree_le: serverTimestamp(),
  });
  b.update(doc(db, "formats/f1"), { stock: opts.formatStock !== undefined ? opts.formatStock : increment(-2), derniere_vente: "v1" });
  b.set(doc(db, "mouvements_stock/m1"), { format_id: "f1", utilisateur_uid: uid, type: "sortie", cree_le: serverTimestamp() });
  b.set(doc(db, `stats_jour/${JOUR}`), {
    ca: opts.ca !== undefined ? opts.ca : increment(total), nb_ventes: increment(1),
    quantites: { f1: increment(2) }, derniere_vente: "v1",
  }, { merge: true });
  b.set(doc(db, "operations_client/o1"), { client_id: "c1", utilisateur_uid: uid, type: "vente", cree_le: serverTimestamp() });
  b.set(doc(db, "clients/c1"), { solde_argent: increment(6000), emballages_dus: { "casier-24": increment(2) }, derniere_operation: "o1" }, { merge: true });
  return b;
}

/** Livraison reçue : bon de réception, stock des formats, dette et casiers dus au fournisseur. */
function batchReception(db: Firestore, uid: string, formats: string[], opts: { autreFormat?: string; commande?: string; fournisseur?: string } = {}) {
  const b = writeBatch(db);
  b.set(doc(db, "receptions/r1"), { utilisateur_uid: uid, fournisseur_id: opts.fournisseur ?? "fo1", format_ids: formats, total: 50000, cree_le: serverTimestamp() });
  // Commande reprise : elle passe « reçue » en citant la réception
  if (opts.commande) b.update(doc(db, `commandes_fournisseur/${opts.commande}`), { statut: "reçue", reception_id: "r1" });
  for (const id of [...formats, ...(opts.autreFormat ? [opts.autreFormat] : [])]) {
    b.update(doc(db, `formats/${id}`), { stock: increment(3), derniere_reception: "r1" });
    b.set(doc(db, `mouvements_stock/mr-${id}`), { format_id: id, utilisateur_uid: uid, type: "entrée", cree_le: serverTimestamp() });
  }
  b.set(doc(db, "operations_fournisseur/of1"), { fournisseur_id: "fo1", utilisateur_uid: uid, type: "réception", cree_le: serverTimestamp() });
  b.set(doc(db, "fournisseurs/fo1"), { solde_argent: increment(20000), emballages_dus: { "casier-24": increment(3) }, derniere_operation: "of1" }, { merge: true });
  return b;
}

/** Vides entrés (variation > 0) ou sortis du magasin, tels que l'application les écrit. */
function batchVides(b: ReturnType<typeof writeBatch>, db: Firestore, uid: string, id: string, emballage: string, variation: number, extra: Record<string, unknown> = {}) {
  b.set(doc(db, `mouvements_vides/${id}`), { emballage_id: emballage, variation, utilisateur_uid: uid, source: "vente", cree_le: serverTimestamp() });
  b.set(doc(db, `emballages/${emballage}`), { stock_vides: increment(variation), dernier_mouvement_vides: id, ...extra }, { merge: true });
}

describe("vendeur — usage normal", () => {
  it("vend en récupérant des vides de deux types (vides au magasin tracés)", async () => {
    const db = en("vendeur");
    const b = batchVente(db, "vendeur");
    batchVides(b, db, "vendeur", "mv1", "casier-24", 2);
    batchVides(b, db, "vendeur", "mv2", "casier-12", 3);
    await assertSucceeds(b.commit());
  });

  it("compte les vides : l'écart est tracé", async () => {
    const db = en("vendeur");
    const b = writeBatch(db);
    batchVides(b, db, "vendeur", "mv3", "casier-24", -4, { dernier_comptage: "2026-10-18 18:00:00" });
    await assertSucceeds(b.commit());
  });

  it("note un comptage sans écart", async () => {
    await assertSucceeds(updateDoc(doc(en("vendeur"), "emballages/casier-24"), { dernier_comptage: "2026-10-18 18:00:00" }));
  });

  it("enregistre un bon de commande envoyé", async () => {
    await assertSucceeds(setDoc(doc(en("vendeur"), "commandes_fournisseur/cmd2"), {
      fournisseur_id: "fo1", lignes: [{ format_id: "f1", quantite: 3 }], statut: "envoyée", reception_id: null,
      utilisateur_uid: "vendeur", cree_le: serverTimestamp(),
    }));
  });

  it("réceptionne une commande en attente (la commande passe « reçue »)", async () => {
    await assertSucceeds(batchReception(en("vendeur"), "vendeur", ["f1"], { commande: "cmd1" }).commit());
  });

  it("lit les commandes en attente", async () => {
    await assertSucceeds(getDoc(doc(en("vendeur"), "commandes_fournisseur/cmd1")));
  });

  it("réceptionne une livraison de 25 produits (stock, dette et casiers fournisseur)", async () => {
    const ids = Array.from({ length: 25 }, (_, i) => `h${i}`);
    await env.withSecurityRulesDisabled(async ctx => {
      for (const id of ids) await setDoc(doc(ctx.firestore(), `formats/${id}`), { produit_id: "p", volume: 1, unite: "L", prix: 1, stock: 0, seuil_alerte: 1 });
    });
    await assertSucceeds(batchReception(en("vendeur"), "vendeur", ids).commit());
  });

  it("paie un fournisseur avec une opération tracée", async () => {
    const db = en("vendeur");
    const b = writeBatch(db);
    b.set(doc(db, "operations_fournisseur/of2"), { fournisseur_id: "fo1", utilisateur_uid: "vendeur", type: "paiement", cree_le: serverTimestamp() });
    b.set(doc(db, "fournisseurs/fo1"), { solde_argent: increment(-10000), derniere_operation: "of2" }, { merge: true });
    await assertSucceeds(b.commit());
  });

  it("enregistre une vente complète (stock, journal, dette, totaux du jour)", async () => {
    await assertSucceeds(batchVente(en("vendeur"), "vendeur").commit());
  });

  it("vend 25 produits différents en une fois (limite de vérifications par écriture)", async () => {
    const ids = Array.from({ length: 25 }, (_, i) => `g${i}`);
    await env.withSecurityRulesDisabled(async ctx => {
      for (const id of ids) await setDoc(doc(ctx.firestore(), `formats/${id}`), { produit_id: "p", volume: 1, unite: "L", prix: 1, stock: 10, seuil_alerte: 1 });
    });
    const db = en("vendeur");
    const b = writeBatch(db);
    b.set(doc(db, "ventes/gros"), { vendeur_uid: "vendeur", statut: "validée", total: 25, format_ids: ids, items: [], cree_le: serverTimestamp() });
    for (const id of ids) {
      b.update(doc(db, `formats/${id}`), { stock: increment(-1), derniere_vente: "gros" });
      b.set(doc(db, `mouvements_stock/m-${id}`), { format_id: id, utilisateur_uid: "vendeur", type: "sortie", cree_le: serverTimestamp() });
    }
    b.set(doc(db, `stats_jour/${JOUR}`), { ca: increment(25), nb_ventes: increment(1), derniere_vente: "gros" }, { merge: true });
    await assertSucceeds(b.commit());
  });

  it("réapprovisionne avec un mouvement de stock", async () => {
    const db = en("vendeur");
    const b = writeBatch(db);
    b.set(doc(db, "mouvements_stock/m2"), { format_id: "f1", utilisateur_uid: "vendeur", type: "entrée", cree_le: serverTimestamp() });
    b.update(doc(db, "formats/f1"), { stock: increment(5), dernier_mouvement: "m2" });
    await assertSucceeds(b.commit());
  });

  it("encaisse un paiement tracé dans le journal", async () => {
    const db = en("vendeur");
    const b = writeBatch(db);
    b.set(doc(db, "operations_client/o2"), { client_id: "c1", utilisateur_uid: "vendeur", type: "paiement", cree_le: serverTimestamp() });
    b.set(doc(db, "clients/c1"), { solde_argent: increment(-5000), derniere_operation: "o2" }, { merge: true });
    await assertSucceeds(b.commit());
  });

  it("crée une fiche client sans dette", async () => {
    await assertSucceeds(setDoc(doc(en("vendeur"), "clients/c3"), { nom: "Nouveau", est_defaut: 0 }));
  });
});

describe("vendeur — tentatives refusées", () => {
  it("monter le stock d'un produit absent de la réception", async () => {
    await assertFails(batchReception(en("vendeur"), "vendeur", ["f1"], { autreFormat: "f9" }).commit());
  });

  it("effacer la dette d'un fournisseur sans opération", async () => {
    await assertFails(updateDoc(doc(en("vendeur"), "fournisseurs/fo1"), { solde_argent: -50000 }));
  });

  it("changer le nombre de vides sans mouvement", async () => {
    await assertFails(updateDoc(doc(en("vendeur"), "emballages/casier-24"), { stock_vides: 500 }));
  });

  it("annoncer 2 vides rentrés mais en ajouter 50", async () => {
    const db = en("vendeur");
    const b = writeBatch(db);
    b.set(doc(db, "mouvements_vides/mv4"), { emballage_id: "casier-24", variation: 2, utilisateur_uid: "vendeur", cree_le: serverTimestamp() });
    b.update(doc(db, "emballages/casier-24"), { stock_vides: increment(50), dernier_mouvement_vides: "mv4" });
    await assertFails(b.commit());
  });

  it("citer le mouvement d'un autre type de casier", async () => {
    const db = en("vendeur");
    const b = writeBatch(db);
    b.set(doc(db, "mouvements_vides/mv5"), { emballage_id: "casier-12", variation: 2, utilisateur_uid: "vendeur", cree_le: serverTimestamp() });
    b.update(doc(db, "emballages/casier-24"), { stock_vides: increment(2), dernier_mouvement_vides: "mv5" });
    await assertFails(b.commit());
  });

  it("renommer un type de casier", async () => {
    await assertFails(updateDoc(doc(en("vendeur"), "emballages/casier-24"), { nom: "Autre" }));
  });

  it("modifier un mouvement de vides", async () => {
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), "mouvements_vides/mv0"), { emballage_id: "casier-24", variation: -3, utilisateur_uid: "vendeur" });
    });
    await assertFails(updateDoc(doc(en("vendeur"), "mouvements_vides/mv0"), { variation: 0 }));
  });

  it("créer une commande déjà « reçue »", async () => {
    await assertFails(setDoc(doc(en("vendeur"), "commandes_fournisseur/cmd3"), {
      fournisseur_id: "fo1", lignes: [], statut: "reçue", reception_id: "r0", utilisateur_uid: "vendeur", cree_le: serverTimestamp(),
    }));
  });

  it("changer les quantités d'une commande envoyée", async () => {
    await assertFails(updateDoc(doc(en("vendeur"), "commandes_fournisseur/cmd1"), { lignes: [{ format_id: "f1", quantite: 50 }] }));
  });

  it("marquer une commande reçue sans réception dans le batch", async () => {
    await assertFails(updateDoc(doc(en("vendeur"), "commandes_fournisseur/cmd1"), { statut: "reçue", reception_id: "r0" }));
  });

  it("solder une commande avec la livraison d'un autre fournisseur", async () => {
    await assertFails(batchReception(en("vendeur"), "vendeur", ["f1"], { commande: "cmd1", fournisseur: "fo2" }).commit());
  });

  it("réceptionner deux fois la même commande", async () => {
    await assertFails(batchReception(en("vendeur"), "vendeur", ["f1"], { commande: "cmd-recue" }).commit());
  });

  it("supprimer une commande, même le gérant", async () => {
    await assertFails(deleteDoc(doc(en("gerant"), "commandes_fournisseur/cmd1")));
  });

  it("modifier un bon de réception", async () => {
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), "receptions/r0"), { utilisateur_uid: "vendeur", total: 1000 });
    });
    await assertFails(updateDoc(doc(en("vendeur"), "receptions/r0"), { total: 1 }));
  });

  it("modifier un stock sans preuve", async () => {
    await assertFails(updateDoc(doc(en("vendeur"), "formats/f1"), { stock: 999 }));
  });

  it("augmenter un stock en se faisant passer pour une vente", async () => {
    await assertFails(batchVente(en("vendeur"), "vendeur", { formatStock: 50 }).commit());
  });

  it("citer une vente qui n'est pas dans le batch", async () => {
    await assertFails(updateDoc(doc(en("vendeur"), "formats/f1"), { stock: increment(-1), derniere_vente: "v-autre" }));
  });

  it("effacer une dette sans entrée de journal", async () => {
    await assertFails(updateDoc(doc(en("vendeur"), "clients/c1"), { solde_argent: 0 }));
  });

  it("effacer la dette d'un client avec le journal d'un autre client", async () => {
    const db = en("vendeur");
    const b = writeBatch(db);
    b.set(doc(db, "operations_client/o3"), { client_id: "c2", utilisateur_uid: "vendeur", type: "paiement", cree_le: serverTimestamp() });
    b.set(doc(db, "clients/c1"), { solde_argent: 0, derniere_operation: "o3" }, { merge: true });
    await assertFails(b.commit());
  });

  it("créer un client avec une dette", async () => {
    await assertFails(setDoc(doc(en("vendeur"), "clients/c4"), { nom: "X", est_defaut: 0, solde_argent: -10000 }));
  });

  it("gonfler le chiffre du jour au-delà de la vente", async () => {
    await assertFails(batchVente(en("vendeur"), "vendeur", { ca: 999999 }).commit());
  });

  it("antidater une vente (date fournie par le téléphone)", async () => {
    await assertFails(setDoc(doc(en("vendeur"), "ventes/v9"), {
      vendeur_uid: "vendeur", statut: "validée", total: 1, format_ids: [], cree_le: new Date(2020, 0, 1),
    }));
  });

  it("enregistrer une vente au nom d'un autre vendeur", async () => {
    await assertFails(batchVente(en("vendeur"), "autre").commit());
  });

  it("annuler une vente", async () => {
    await assertFails(updateDoc(doc(en("vendeur"), "ventes/v-autre"), { statut: "annulée" }));
  });

  it("lire les ventes d'un autre vendeur", async () => {
    await assertFails(getDoc(doc(en("vendeur"), "ventes/v-autre")));
  });

  it("changer la version minimale de l'application", async () => {
    await assertFails(setDoc(doc(en("vendeur"), "config/app"), { version_min: "0.0.1" }));
  });

  it("changer le prix d'un groupe de prix", async () => {
    await assertFails(setDoc(doc(en("vendeur"), "prix_groupes/g1_f1"), { groupe_id: "g1", format_id: "f1", prix: 100 }));
  });

  it("changer le groupe de prix d'un client", async () => {
    await assertFails(updateDoc(doc(en("vendeur"), "clients/c1"), { groupe_prix_id: "g1" }));
  });
});

describe("comptes désactivés et gérant", () => {
  it("un compte désactivé ne peut plus vendre", async () => {
    await assertFails(batchVente(en("ancien"), "ancien").commit());
  });

  it("le gérant corrige un stock directement", async () => {
    await assertSucceeds(updateDoc(doc(en("gerant"), "formats/f1"), { stock: 7 }));
  });

  it("le gérant crée un groupe de prix et sa grille", async () => {
    await assertSucceeds(setDoc(doc(en("gerant"), "groupes_prix/g2"), { nom: "Bars" }));
    await assertSucceeds(setDoc(doc(en("gerant"), "prix_groupes/g2_f1"), { groupe_id: "g2", format_id: "f1", prix: 5750 }));
  });

  it("le vendeur lit les prix d'un groupe", async () => {
    await assertSucceeds(getDoc(doc(en("vendeur"), "prix_groupes/g2_f1")));
  });

  it("le gérant fixe la version minimale", async () => {
    await assertSucceeds(setDoc(doc(en("gerant"), "config/app"), { version_min: "1.2.0" }));
  });
});
