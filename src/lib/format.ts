/**
 * Volume à la française : 0.33 + "L" → « 0,33 L ».
 * casier : bouteilles du casier quand ce n'est pas le casier habituel → « 0,5 L (casier de 12) ».
 */
export function volumeFr(volume: number | null | undefined, unite: string | null | undefined, casier?: number | null): string {
  if (volume == null) return "";
  // Packs (eaux, PET) : le volume est le nombre de bouteilles, 1 = « pack » simplement
  if (unite === "pack") return volume > 1 ? `pack de ${volume}` : "pack";
  // Canettes : taille unique ; le volume est le nombre de canettes du carton, 1 = à l'unité
  if (unite === "canette") return volume > 1 ? `carton de ${volume} canettes` : "canette";
  const base = `${volume.toLocaleString("fr-FR")} ${unite ?? ""}`.trim();
  return casier ? `${base} (casier de ${casier})` : base;
}

/** « 1 casier », « 3 casiers » */
export function casiers(n: number): string {
  return `${n} casier${Math.abs(n) > 1 ? "s" : ""}`;
}

/**
 * Nombre à la française (12 500). Le navigateur sépare les milliers par une
 * espace fine, presque invisible avec la police Inter : on la remplace par une
 * espace insécable normale.
 */
export function nombreFr(n: number): string {
  return n.toLocaleString("fr-FR").replace(/ /g, " ");
}
