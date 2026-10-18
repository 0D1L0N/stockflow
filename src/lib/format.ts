/** Volume à la française : 0.33 + "L" → « 0,33 L ». */
export function volumeFr(volume: number | null | undefined, unite: string | null | undefined): string {
  if (volume == null) return "";
  // Packs (eaux, PET) : le volume est le nombre de bouteilles, 1 = « pack » simplement
  if (unite === "pack") return volume > 1 ? `pack de ${volume}` : "pack";
  return `${volume.toLocaleString("fr-FR")} ${unite ?? ""}`.trim();
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
