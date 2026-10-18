import { create } from "zustand";
import { invoke } from "@/lib/db";
import { nombreFr } from "@/lib/format";

export interface FormatAlerte {
  id: string; produit_id: string; produit_nom: string;
  volume: number; unite: string; prix: number;
  stock: number; seuil_alerte: number; en_alerte: number; quantite_manquante: number;
}

interface AppStore {
  nombreAlertes: number;
  alertes: FormatAlerte[];
  devise: string;
  symbole: string;
  position: "before" | "after";
  setNombreAlertes: (n: number) => void;
  setDevise: (devise: string, symbole: string, position: "before" | "after") => void;
  formatMontant: (valeur: number) => string;
  loadAlertes: () => Promise<void>;
}

export const useAppStore = create<AppStore>((set, get) => ({
  nombreAlertes: 0,
  alertes: [],
  devise: "FCFA",
  symbole: "FCFA",
  position: "after",

  setNombreAlertes: (n) => set({ nombreAlertes: n }),

  setDevise: (devise, symbole, position) => set({ devise, symbole, position }),

  formatMontant: (valeur) => {
    const { symbole, position } = get();
    const formatted = nombreFr(valeur);
    return position === "before"
      ? `${symbole} ${formatted}`
      : `${formatted} ${symbole}`;
  },

  loadAlertes: async () => {
    const alertes = await invoke<FormatAlerte[]>("get_formats_en_alerte");
    set({ alertes, nombreAlertes: alertes.length });
  },
}));
