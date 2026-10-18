/**
 * Familles d'articles, dans l'ordre des fiches de prix papier :
 * grandes bouteilles (casier 12), casier 20, petites (casier 24), eaux, PET, canettes.
 * La famille d'un format vient de son casier ; sans casier, du rayon du produit.
 */
export type Rayon = "eau" | "pet" | "canette";
export type CleFamille = "casier-12" | "casier-20" | "casier-24" | "eau" | "pet" | "canette" | "autres";

export const FAMILLES: { cle: CleFamille; label: string; court: string }[] = [
  { cle: "casier-12", label: "Grandes bouteilles · casier de 12", court: "Casier 12" },
  { cle: "casier-20", label: "Bouteilles · casier de 20", court: "Casier 20" },
  { cle: "casier-24", label: "Petites bouteilles · casier de 24", court: "Casier 24" },
  { cle: "eau", label: "Eaux · packs", court: "Eaux" },
  { cle: "pet", label: "PET · packs", court: "PET" },
  { cle: "canette", label: "Canettes", court: "Canettes" },
  { cle: "autres", label: "Autres", court: "Autres" },
];

export const RAYONS: { valeur: "" | Rayon; label: string }[] = [
  { valeur: "", label: "Bières et sucreries en casier" },
  { valeur: "eau", label: "Eaux (packs)" },
  { valeur: "pet", label: "PET (sucreries en bouteille plastique)" },
  { valeur: "canette", label: "Canettes (taille unique, sans consigne)" },
];

export function familleDe(emballageId: string | null | undefined, rayon: Rayon | null | undefined): CleFamille {
  if (emballageId === "casier-12" || emballageId === "casier-20" || emballageId === "casier-24") return emballageId;
  return rayon ?? "autres";
}

/** Regroupe des éléments par famille, dans l'ordre des fiches ; les familles vides sont omises. */
export function grouperParFamille<T>(items: T[], cle: (t: T) => CleFamille) {
  return FAMILLES
    .map(f => ({ ...f, items: items.filter(i => cle(i) === f.cle) }))
    .filter(g => g.items.length > 0);
}
