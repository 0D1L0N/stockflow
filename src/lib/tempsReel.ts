import { useEffect, useRef } from "react";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { create } from "zustand";
import { db } from "@/lib/firebase";

// ── Mises à jour en direct entre appareils ──────────────────────────────────

/**
 * Signaux écoutés plutôt que des collections entières : écouter toutes les
 * ventes coûterait de plus en plus de lectures. Les totaux du jour changent à
 * chaque vente ou annulation, c'est un signal léger.
 */
export type Signal = "stock" | "clients" | "prix" | "ventes_du_jour";

/**
 * Collections écoutées pour chaque signal. « stock » couvre tout le catalogue
 * (produits, formats, types de casiers) : un produit ajouté ou renommé sur un
 * téléphone apparaît sur les autres sans recharger.
 */
const COLLECTIONS: Record<Exclude<Signal, "ventes_du_jour">, string[]> = {
  stock: ["formats", "produits", "emballages"],
  clients: ["clients"],
  prix: ["prix_clients", "prix_groupes", "groupes_prix"],
};

function jourLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Relance `recharger` quand les données changent, y compris depuis un autre
 * appareil. Le premier instantané (état initial) est ignoré, et les rafales
 * de changements sont regroupées.
 */
export function useTempsReel(signaux: Signal[], recharger: () => void) {
  const rappel = useRef(recharger);
  rappel.current = recharger;

  useEffect(() => {
    let minuterie: ReturnType<typeof setTimeout> | undefined;
    const declencher = () => {
      clearTimeout(minuterie);
      minuterie = setTimeout(() => rappel.current(), 400);
    };
    // Une erreur (droits insuffisants pour ce rôle, réseau) ne doit rien casser
    const surErreur = () => {};
    const ecouter = (abonner: (suivant: () => void) => () => void) => {
      let premier = true;
      return abonner(() => { if (premier) { premier = false; return; } declencher(); });
    };
    const arrets = signaux.flatMap(s => s === "ventes_du_jour"
      ? [ecouter(suivant => onSnapshot(doc(db, "stats_jour", jourLocal()), suivant, surErreur))]
      : COLLECTIONS[s].map(nom => ecouter(suivant => onSnapshot(collection(db, nom), suivant, surErreur))));
    return () => { clearTimeout(minuterie); arrets.forEach(a => a()); };
  }, [signaux.join("|")]);
}

// ── État de la synchronisation (hors ligne, écritures en attente) ───────────

interface SyncStore {
  enLigne: boolean;
  enAttente: number;
}

export const useSyncStore = create<SyncStore>(() => ({
  enLigne: typeof navigator === "undefined" ? true : navigator.onLine,
  enAttente: 0,
}));

if (typeof window !== "undefined") {
  window.addEventListener("online", () => useSyncStore.setState({ enLigne: true }));
  window.addEventListener("offline", () => useSyncStore.setState({ enLigne: false }));
}

/** Compte une écriture tant que le serveur ne l'a pas confirmée. */
export function suivreEcriture<T>(promesse: Promise<T>): void {
  useSyncStore.setState(s => ({ enAttente: s.enAttente + 1 }));
  promesse.finally(() => useSyncStore.setState(s => ({ enAttente: Math.max(0, s.enAttente - 1) })));
}
