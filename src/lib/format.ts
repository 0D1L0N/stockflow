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

/**
 * Numéro béninois au format à 10 chiffres (depuis 2024 : 01 devant les 8 anciens chiffres) :
 * « 97000000 », « +229 97 00 00 00 » ou « 0197000000 » → « 01 97 00 00 00 ».
 * Un numéro étranger ou incomplet est gardé tel que saisi. Vide → null.
 */
export function telephoneFr(saisie: unknown): string | null {
  const brut = String(saisie ?? "").trim();
  if (!brut) return null;
  let chiffres = brut.replace(/\D/g, "");
  if (chiffres.startsWith("00229")) chiffres = chiffres.slice(5);
  else if (chiffres.startsWith("229") && (chiffres.length === 11 || chiffres.length === 13)) chiffres = chiffres.slice(3);
  if (chiffres.length === 8) chiffres = "01" + chiffres;
  if (chiffres.length !== 10 || !chiffres.startsWith("01")) return brut;
  return chiffres.replace(/(\d{2})(?=\d)/g, "$1 ");
}

/** Numéro pour un lien WhatsApp (wa.me) : indicatif 229 compris, sans + ni espaces. */
export function numeroWhatsApp(telephone: unknown): string {
  const t = telephoneFr(telephone);
  if (!t) return "";
  const chiffres = t.replace(/\D/g, "");
  return chiffres.length === 10 && chiffres.startsWith("01") ? "229" + chiffres : chiffres;
}

/** Texte en minuscules sans accents, pour chercher « beninoise » et trouver « Béninoise ». */
export function sansAccent(texte: string): string {
  return texte.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
