import { create } from "zustand";
import { CLIENT_DEFAUT } from "@/lib/api";

export interface VenteItem { casier?: number | null;
  format_id: string;
  nom: string;
  volume: number;
  unite: string;
  prix: number;
  stock: number;
  quantite: number;
  sous_total: number;
}

interface VenteStore {
  client_id: string;
  items: VenteItem[];
  total: number;
  montant_recu: number;
  monnaie_rendue: number;

  setClient: (id: string) => void;
  addItem: (item: Omit<VenteItem, "quantite" | "sous_total">) => void;
  removeItem: (format_id: string) => void;
  updateQuantite: (format_id: string, quantite: number) => void;
  updatePrix: (format_id: string, nouveau_prix: number) => void;
  setMontantRecu: (montant: number) => void;
  calculerTotal: () => number;
  calculerMonnaie: () => number;
  resetPanier: () => void;
}

function sumItems(items: VenteItem[]): number {
  return items.reduce((s, i) => s + i.sous_total, 0);
}

export const useVenteStore = create<VenteStore>((set, get) => ({
  client_id: CLIENT_DEFAUT,
  items: [],
  total: 0,
  montant_recu: 0,
  monnaie_rendue: 0,

  setClient: (id) => set({ client_id: id }),

  addItem: (newItem) =>
    set((state) => {
      const idx = state.items.findIndex((i) => i.format_id === newItem.format_id);
      const items: VenteItem[] =
        idx >= 0
          ? state.items.map((i, index) =>
              index === idx
                ? { ...i, quantite: i.quantite + 1, sous_total: (i.quantite + 1) * i.prix }
                : i
            )
          : [...state.items, { ...newItem, quantite: 1, sous_total: newItem.prix }];
      const total = sumItems(items);
      return { items, total, monnaie_rendue: Math.max(0, state.montant_recu - total) };
    }),

  removeItem: (format_id) =>
    set((state) => {
      const items = state.items.filter((i) => i.format_id !== format_id);
      const total = sumItems(items);
      return { items, total, monnaie_rendue: Math.max(0, state.montant_recu - total) };
    }),

  updateQuantite: (format_id, quantite) =>
    set((state) => {
      const items =
        quantite < 1
          ? state.items.filter((i) => i.format_id !== format_id)
          : state.items.map((i) =>
              i.format_id === format_id
                ? { ...i, quantite, sous_total: quantite * i.prix }
                : i
            );
      const total = sumItems(items);
      return { items, total, monnaie_rendue: Math.max(0, state.montant_recu - total) };
    }),

  updatePrix: (format_id, nouveau_prix) =>
    set((state) => {
      const items = state.items.map((i) =>
        i.format_id === format_id
          ? { ...i, prix: nouveau_prix, sous_total: i.quantite * nouveau_prix }
          : i
      );
      const total = sumItems(items);
      return { items, total, monnaie_rendue: Math.max(0, state.montant_recu - total) };
    }),

  setMontantRecu: (montant) =>
    set((state) => ({
      montant_recu: montant,
      monnaie_rendue: Math.max(0, montant - state.total),
    })),

  calculerTotal: () => {
    const total = sumItems(get().items);
    set({ total });
    return total;
  },

  calculerMonnaie: () => {
    const { montant_recu, total } = get();
    const monnaie_rendue = Math.max(0, montant_recu - total);
    set({ monnaie_rendue });
    return monnaie_rendue;
  },

  resetPanier: () =>
    set({ client_id: CLIENT_DEFAUT, items: [], total: 0, montant_recu: 0, monnaie_rendue: 0 }),
}));
