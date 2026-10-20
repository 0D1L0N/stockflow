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
  collection, deleteDoc, doc, getDoc, getDocs, increment, query, serverTimestamp, setDoc, updateDoc, where, writeBatch, type Firestore,
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
    await setDoc(doc(db, "users/admin"), { nom: "Ad", role: "admin", actif: true });
    await setDoc(doc(db, "users/chef"), { nom: "G", role: "gerant", actif: true });
    await setDoc(doc(db, "users/vendeur"), { nom: "M", role: "magasinier", actif: true });
    await setDoc(doc(db, "users/autre"), { nom: "A", role: "magasinier", actif: true });
    await setDoc(doc(db, "users/ancien"), { nom: "X", role: "magasinier", actif: false });
    // Compte « vendeur » d'avant les nouveaux rôles : traité comme magasinier
    await setDoc(doc(db, "users/vieux"), { nom: "V", role: "vendeur", actif: true });
    // Propriétaire pas encore passé admin
    await setDoc(doc(db, "users/proprio"), { nom: "P", role: "gerant", actif: true });
    await setDoc(doc(db, "config/proprietaire"), { uid: "proprio" });
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

describe("magasinier — usage normal", () => {
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

describe("magasinier — tentatives refusées", () => {
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

  it("supprimer une commande, même l'admin", async () => {
    await assertFails(deleteDoc(doc(en("admin"), "commandes_fournisseur/cmd1")));
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

describe("comptes désactivés et admin", () => {
  it("un compte désactivé ne peut plus vendre", async () => {
    await assertFails(batchVente(en("ancien"), "ancien").commit());
  });

  it("l'admin corrige un stock directement", async () => {
    await assertSucceeds(updateDoc(doc(en("admin"), "formats/f1"), { stock: 7 }));
  });

  it("l'admin crée un groupe de prix et sa grille", async () => {
    await assertSucceeds(setDoc(doc(en("admin"), "groupes_prix/g2"), { nom: "Bars" }));
    await assertSucceeds(setDoc(doc(en("admin"), "prix_groupes/g2_f1"), { groupe_id: "g2", format_id: "f1", prix: 5750 }));
  });

  it("le magasinier lit les prix d'un groupe", async () => {
    await assertSucceeds(getDoc(doc(en("vendeur"), "prix_groupes/g2_f1")));
  });

  it("l'admin fixe la version minimale", async () => {
    await assertSucceeds(setDoc(doc(en("admin"), "config/app"), { version_min: "1.2.0" }));
  });
});

describe("gérant", () => {
  it("vend (stock, journal, dette et totaux du jour tracés)", async () => {
    await assertSucceeds(batchVente(en("chef"), "chef").commit());
  });

  it("fixe le prix d'un groupe et range un client dedans", async () => {
    await assertSucceeds(setDoc(doc(en("chef"), "prix_groupes/g2_f1"), { groupe_id: "g2", format_id: "f1", prix: 5750 }));
    await assertSucceeds(updateDoc(doc(en("chef"), "clients/c2"), { groupe_prix_id: "g2" }));
  });

  it("crée un produit et change un prix comptoir", async () => {
    await assertSucceeds(setDoc(doc(en("chef"), "produits/p2"), { nom: "Nouvelle bière" }));
    await assertSucceeds(updateDoc(doc(en("chef"), "formats/f1"), { prix: 6200 }));
  });

  it("lit les ventes de tout le monde", async () => {
    await assertSucceeds(getDoc(doc(en("chef"), "ventes/v-autre")));
  });

  it("ne peut pas annuler une vente", async () => {
    await assertFails(updateDoc(doc(en("chef"), "ventes/v-autre"), { statut: "annulée", date_annulation: JOUR }));
  });

  it("ne peut pas supprimer un client, un produit ou un format", async () => {
    await assertFails(deleteDoc(doc(en("chef"), "clients/c2")));
    await assertFails(deleteDoc(doc(en("chef"), "formats/f9")));
  });

  it("ne peut pas effacer une dette à la main", async () => {
    await assertFails(updateDoc(doc(en("chef"), "clients/c1"), { solde_argent: 0 }));
  });

  it("ne peut pas gérer les comptes ni les paramètres", async () => {
    await assertFails(setDoc(doc(en("chef"), "users/nouveau"), { nom: "N", role: "admin", actif: true }));
    await assertFails(getDoc(doc(en("chef"), "users/vendeur")));
    await assertFails(setDoc(doc(en("chef"), "config/app"), { version_min: "0.0.1" }));
    await assertFails(setDoc(doc(en("chef"), "parametres/general"), { nom_commerce: "X" }, { merge: true }));
  });
});

describe("magasinier — limites des nouveaux rôles", () => {
  it("ne peut pas changer un prix comptoir", async () => {
    await assertFails(updateDoc(doc(en("vendeur"), "formats/f1"), { prix: 1 }));
  });

  it("ne peut pas créer un client rangé dans un groupe de prix", async () => {
    await assertFails(setDoc(doc(en("vendeur"), "clients/c5"), { nom: "X", est_defaut: 0, groupe_prix_id: "g2" }));
  });

  it("ne lit pas le journal des comptes clients", async () => {
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), "operations_client/o0"), { client_id: "c1", utilisateur_uid: "admin", type: "paiement" });
    });
    await assertFails(getDoc(doc(en("vendeur"), "operations_client/o0")));
  });

  it("un ancien compte « vendeur » vend toujours (comme magasinier)", async () => {
    await assertSucceeds(batchVente(en("vieux"), "vieux").commit());
  });
});

describe("admin et propriétaire", () => {
  it("le propriétaire est admin même avant de changer de rôle", async () => {
    await assertSucceeds(setDoc(doc(en("proprio"), "config/app"), { version_min: "1.16.0" }));
  });

  it("le propriétaire passe lui-même son rôle à admin", async () => {
    await assertSucceeds(updateDoc(doc(en("proprio"), "users/proprio"), { role: "admin" }));
  });

  it("personne ne retire ses droits au propriétaire", async () => {
    await assertFails(updateDoc(doc(en("admin"), "users/proprio"), { role: "magasinier" }));
    await assertFails(updateDoc(doc(en("admin"), "users/proprio"), { actif: false }));
  });

  it("l'admin change le rôle d'un employé et annule une vente", async () => {
    await assertSucceeds(updateDoc(doc(en("admin"), "users/vieux"), { role: "magasinier" }));
    await assertSucceeds(updateDoc(doc(en("admin"), "ventes/v-autre"), { statut: "annulée", date_annulation: JOUR }));
  });

  it("un admin ne se retire pas ses propres droits", async () => {
    await assertFails(updateDoc(doc(en("admin"), "users/admin"), { role: "gerant" }));
  });
});

describe("journal des actions", () => {
  const entree = (uid: string, extra: Record<string, unknown> = {}) => ({
    categorie: "prix", action: "update_format", libelle: "Format modifié", details: [], restauration: null,
    utilisateur_uid: uid, restaure_le: null, restaure_par: null, cree_le: serverTimestamp(), ...extra,
  });

  it("chacun note ses propres actions", async () => {
    await assertSucceeds(setDoc(doc(en("vendeur"), "journal/j1"), entree("vendeur")));
    await assertSucceeds(setDoc(doc(en("chef"), "journal/j2"), entree("chef")));
  });

  it("personne ne note une action au nom d'un autre ni ne l'antidate", async () => {
    await assertFails(setDoc(doc(en("vendeur"), "journal/j3"), entree("chef")));
    await assertFails(setDoc(doc(en("vendeur"), "journal/j4"), entree("vendeur", { cree_le: new Date(2020, 0, 1) })));
    await assertFails(setDoc(doc(en("vendeur"), "journal/j5"), entree("vendeur", { restaure_le: JOUR })));
  });

  it("le gérant lit le journal, pas le magasinier", async () => {
    await env.withSecurityRulesDisabled(async ctx => { await setDoc(doc(ctx.firestore(), "journal/j0"), { ...entree("admin"), cree_le: null }); });
    await assertSucceeds(getDoc(doc(en("chef"), "journal/j0")));
    await assertFails(getDoc(doc(en("vendeur"), "journal/j0")));
  });

  it("seul l'admin marque une action restaurée, une seule fois, sans rien réécrire d'autre", async () => {
    await env.withSecurityRulesDisabled(async ctx => { await setDoc(doc(ctx.firestore(), "journal/j0"), { ...entree("admin"), cree_le: null }); });
    await assertFails(updateDoc(doc(en("chef"), "journal/j0"), { restaure_le: JOUR, restaure_par: "G" }));
    await assertFails(updateDoc(doc(en("admin"), "journal/j0"), { libelle: "autre chose" }));
    await assertSucceeds(updateDoc(doc(en("admin"), "journal/j0"), { restaure_le: JOUR, restaure_par: "Ad" }));
    await assertFails(updateDoc(doc(en("admin"), "journal/j0"), { restaure_le: "2026-10-20", restaure_par: "Ad" }));
  });

  it("personne n'efface le journal", async () => {
    await env.withSecurityRulesDisabled(async ctx => { await setDoc(doc(ctx.firestore(), "journal/j0"), { ...entree("admin"), cree_le: null }); });
    await assertFails(deleteDoc(doc(en("admin"), "journal/j0")));
  });
});

describe("règlement d'une facture après coup", () => {
  async function venteACredit() {
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), "ventes/vc"), { vendeur_uid: "vendeur", client_id: "c1", total: 12000, reste_du: 12000, statut: "validée", format_ids: [] });
    });
  }
  function batchReglement(db: Firestore, uid: string, opts: { venteOp?: string; montant?: number } = {}) {
    const b = writeBatch(db);
    b.set(doc(db, "operations_client/or1"), { client_id: "c1", utilisateur_uid: uid, type: "paiement", vente_id: opts.venteOp ?? "vc", cree_le: serverTimestamp() });
    b.set(doc(db, "clients/c1"), { solde_argent: increment(-(opts.montant ?? 5000)), derniere_operation: "or1" }, { merge: true });
    b.update(doc(db, "ventes/vc"), { regle_apres: increment(opts.montant ?? 5000), dernier_reglement: "or1" });
    return b;
  }

  it("le gérant règle une partie de la facture", async () => {
    await venteACredit();
    await assertSucceeds(batchReglement(en("chef"), "chef").commit());
  });

  it("le magasinier ne règle pas une facture après coup", async () => {
    await venteACredit();
    await assertFails(batchReglement(en("vendeur"), "vendeur").commit());
  });

  it("le règlement doit citer une entrée de journal de cette vente", async () => {
    await venteACredit();
    await assertFails(batchReglement(en("chef"), "chef", { venteOp: "autre-vente" }).commit());
  });

  it("on ne fait pas baisser ce qui a été réglé", async () => {
    await venteACredit();
    await assertFails(batchReglement(en("chef"), "chef", { montant: -3000 }).commit());
  });

  it("ni le total ni les articles ne changent", async () => {
    await venteACredit();
    await assertFails(updateDoc(doc(en("chef"), "ventes/vc"), { total: 1 }));
  });
});

describe("retour de livraison", () => {
  async function venteEnLivraison() {
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), "ventes/vl"), { vendeur_uid: "chef", client_id: "c1", total: 30000, reste_du: 30000, statut: "validée",
        livraison: { statut: "en_cours", livreurs: ["Ignace", "Herman"], date_cloture: null }, format_ids: [] });
      await setDoc(doc(ctx.firestore(), "ventes/vc"), { vendeur_uid: "chef", client_id: "c1", total: 12000, reste_du: 12000, statut: "validée", format_ids: [] });
    });
  }
  function batchRetour(db: Firestore, uid: string, opts: { vente?: string; livreurs?: string[]; statut?: string } = {}) {
    const v = opts.vente ?? "vl";
    const b = writeBatch(db);
    b.set(doc(db, "operations_client/ol1"), { client_id: "c1", utilisateur_uid: uid, type: "paiement", vente_id: v, cree_le: serverTimestamp() });
    b.set(doc(db, "clients/c1"), { solde_argent: increment(-20000), derniere_operation: "ol1" }, { merge: true });
    b.update(doc(db, `ventes/${v}`), {
      regle_apres: increment(20000), dernier_reglement: "ol1",
      "livraison.statut": opts.statut ?? "livrée", "livraison.recu": 20000,
      ...(opts.livreurs ? { "livraison.livreurs": opts.livreurs } : {}),
    });
    return b;
  }

  it("le magasinier voit les livraisons en cours des autres", async () => {
    await venteEnLivraison();
    await assertSucceeds(getDocs(query(collection(en("vendeur"), "ventes"), where("livraison.statut", "==", "en_cours"))));
  });

  it("le magasinier note le retour du livreur", async () => {
    await venteEnLivraison();
    await assertSucceeds(batchRetour(en("vendeur"), "vendeur").commit());
  });

  it("une vente qui n'est pas une livraison ne se clôt pas ainsi", async () => {
    await venteEnLivraison();
    await assertFails(batchRetour(en("vendeur"), "vendeur", { vente: "vc" }).commit());
  });

  it("on ne change pas les livreurs", async () => {
    await venteEnLivraison();
    await assertFails(batchRetour(en("vendeur"), "vendeur", { livreurs: ["Quelqu'un"] }).commit());
  });

  it("une livraison clôturée ne se rouvre pas", async () => {
    await venteEnLivraison();
    await assertSucceeds(batchRetour(en("vendeur"), "vendeur").commit());
    await assertFails(batchRetour(en("vendeur"), "vendeur", { statut: "en_cours" }).commit());
  });
});
