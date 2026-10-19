import { useMemo } from "react";
import { create } from "zustand";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { casierInhabituel, parVolume, type Format, type Produit } from "@/lib/api/catalogue";
import { parNom } from "@/lib/api/outils";

/**
 * Catalogue partagé par toute l'application (produits, formats, types de casiers).
 *
 * Chargé une seule fois après la connexion puis tenu à jour en direct : Firestore
 * n'envoie que les documents modifiés (une vente sur un autre téléphone = un format
 * relu, pas tout le catalogue). Les pages le lisent ici au lieu de tout redemander
 * au serveur à chaque affichage ; au démarrage il sort aussitôt du cache de l'appareil.
 */
export interface Emballage { id: string; nom: string; ordre?: number }
export interface ProduitAvecFormats { produit: Produit; formats: Format[] }

interface CatalogueStore {
  produits: Produit[];
  formatsBruts: Format[];
  emballages: Emballage[];
  /** Les trois collections ont été reçues au moins une fois */
  pret: boolean;
  /** Augmente à chaque changement (signal pour les pages qui recalculent) */
  version: number;
  /** Signaux légers : clients (soldes) et prix par client / par groupe ont changé */
  versionClients: number;
  versionPrix: number;
}

export const useCatalogueStore = create<CatalogueStore>(() => ({
  produits: [], formatsBruts: [], emballages: [], pret: false, version: 0, versionClients: 0, versionPrix: 0,
}));

let arret: (() => void) | null = null;

/** Démarre l'écoute (une seule fois, tant que l'utilisateur est connecté). */
export function demarrerCatalogue(): () => void {
  if (arret) return arret;
  const recus = new Set<string>();
  const recu = (nom: string, maj: Partial<CatalogueStore>) => {
    recus.add(nom);
    useCatalogueStore.setState(s => ({ ...maj, pret: recus.size === 3, version: s.version + 1 }));
  };
  const ignorer = () => {};
  const arrets = [
    onSnapshot(collection(db, "produits"), snap => recu("produits", { produits: snap.docs.map(d => ({ id: d.id, ...d.data() }) as Produit) }), ignorer),
    onSnapshot(collection(db, "formats"), snap => recu("formats", { formatsBruts: snap.docs.map(d => ({ id: d.id, ...d.data() }) as Format) }), ignorer),
    onSnapshot(collection(db, "emballages"), snap => recu("emballages", {
      emballages: snap.docs.map(d => ({ id: d.id, ...d.data() }) as Emballage)
        .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0) || a.nom.localeCompare(b.nom, "fr")),
    }), ignorer),
    // Une seule écoute par collection pour toute l'application (et non une par page ouverte) ;
    // le premier envoi est le chargement, seuls les suivants sont des changements
    ...(["clients", "prix_clients", "prix_groupes", "groupes_prix"] as const).map(nom => {
      let premier = true;
      const cle = nom === "clients" ? "versionClients" : "versionPrix";
      return onSnapshot(collection(db, nom), () => {
        if (premier) { premier = false; return; }
        useCatalogueStore.setState(s => ({ [cle]: s[cle] + 1 }) as Partial<CatalogueStore>);
      }, ignorer);
    }),
  ];
  arret = () => { arrets.forEach(a => a()); arret = null; useCatalogueStore.setState({ pret: false }); };
  return arret;
}

/** Formats en vente (sans ceux retirés du catalogue), avec leur casier inhabituel calculé. */
export function formatsActifs(s: Pick<CatalogueStore, "formatsBruts" | "emballages">): Format[] {
  return s.formatsBruts.filter(f => !f.archive)
    .map(f => ({ ...f, casier: casierInhabituel(f, s.emballages) }))
    .sort(parVolume);
}

/** Produits triés par nom, chacun avec ses formats en vente. */
export function produitsAvecFormats(s: Pick<CatalogueStore, "produits" | "formatsBruts" | "emballages">): ProduitAvecFormats[] {
  const formats = formatsActifs(s);
  const parProduit = new Map<string, Format[]>();
  for (const f of formats) parProduit.set(f.produit_id, [...(parProduit.get(f.produit_id) ?? []), f]);
  return [...s.produits].sort(parNom).map(produit => ({ produit, formats: parProduit.get(produit.id) ?? [] }));
}

/** Le catalogue prêt à afficher ; recalculé seulement quand il change. */
export function useCatalogue() {
  const { produits, formatsBruts, emballages, pret } = useCatalogueStore();
  const liste = useMemo(() => produitsAvecFormats({ produits, formatsBruts, emballages }), [produits, formatsBruts, emballages]);
  return { pret, produits: liste, emballages };
}

/** Attend que le catalogue soit chargé (pour les fenêtres qui en ont besoin à l'ouverture). */
export function catalogueCharge(): Promise<CatalogueStore> {
  const s = useCatalogueStore.getState();
  if (s.pret) return Promise.resolve(s);
  return new Promise(resolve => {
    const fin = useCatalogueStore.subscribe(n => { if (n.pret) { fin(); resolve(n); } });
  });
}
