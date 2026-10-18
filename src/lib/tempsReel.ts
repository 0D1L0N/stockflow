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
export type Signal = "stock" | "clients" | "ventes_du_jour";

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
    const arrets = signaux.map(s => {
      let premier = true;
      const surChangement = () => { if (premier) { premier = false; return; } declencher(); };
      // Une erreur (droits insuffisants pour ce rôle, réseau) ne doit rien casser
      const surErreur = () => {};
      if (s === "ventes_du_jour") return onSnapshot(doc(db, "stats_jour", jourLocal()), surChangement, surErreur);
      return onSnapshot(collection(db, s === "stock" ? "formats" : "clients"), surChangement, surErreur);
    });
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
