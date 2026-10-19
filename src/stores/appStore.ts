import { create } from "zustand";
import { invoke } from "@/lib/db";
import { nombreFr } from "@/lib/format";
import { useCatalogueStore, formatsActifs } from "@/stores/catalogueStore";

export interface FormatAlerte { casier?: number | null;
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
    const catalogue = useCatalogueStore.getState();
    const alertes = catalogue.pret ? alertesDuCatalogue(catalogue) : await invoke<FormatAlerte[]>("get_formats_en_alerte");
    set({ alertes, nombreAlertes: alertes.length });
  },
}));

/** Formats sous leur seuil, les plus vides d'abord (même résultat que get_formats_en_alerte). */
function alertesDuCatalogue(c: ReturnType<typeof useCatalogueStore.getState>): FormatAlerte[] {
  const noms = new Map(c.produits.map(p => [p.id, p.nom]));
  return formatsActifs(c)
    .filter(f => f.prix > 0 && f.stock <= f.seuil_alerte)
    .map(f => ({ ...f, produit_nom: noms.get(f.produit_id) ?? "?", en_alerte: 1, quantite_manquante: Math.max(0, f.seuil_alerte - f.stock) }))
    .sort((a, b) => a.stock - b.stock);
}
