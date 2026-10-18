import type { FactureData } from "./FacturePDF";

/** Mode de paiement réel : comptant, paiement partiel ou à crédit. */
export function modePaiement(data: FactureData): string {
  const a = data.compte?.argent;
  if (!a || a.nouveau <= 0) return "Espèces";
  return a.paye > 0 ? "Espèces · paiement partiel" : "À crédit";
}

/** Nombre total de casiers (ou cartons, packs) de la facture. */
export const totalCasiers = (data: FactureData) => data.items.reduce((t, i) => t + i.quantite, 0);

const UNITES = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix",
  "onze", "douze", "treize", "quatorze", "quinze", "seize"];
const DIZAINES = ["", "dix", "vingt", "trente", "quarante", "cinquante", "soixante"];

/** 0 à 99 */
function deuxChiffres(n: number): string {
  if (n <= 16) return UNITES[n];
  if (n < 20) return "dix-" + UNITES[n - 10];
  const d = Math.floor(n / 10), u = n % 10;
  if (d === 7 || d === 9) {
    // 70-79 : soixante-dix… ; 90-99 : quatre-vingt-dix…
    const base = d === 7 ? "soixante" : "quatre-vingt";
    const reste = 10 + u;
    if (d === 7 && u === 1) return "soixante et onze";
    return `${base}-${deuxChiffres(reste)}`;
  }
  if (d === 8) return u === 0 ? "quatre-vingts" : `quatre-vingt-${UNITES[u]}`;
  if (u === 0) return DIZAINES[d];
  if (u === 1) return `${DIZAINES[d]} et un`;
  return `${DIZAINES[d]}-${UNITES[u]}`;
}

/** 0 à 999 ; « cents » ne prend un s que s'il termine le nombre */
function troisChiffres(n: number, final: boolean): string {
  const c = Math.floor(n / 100), r = n % 100;
  const dizaines = r === 80 && !final ? "quatre-vingt" : deuxChiffres(r);
  if (c === 0) return dizaines;
  const centaines = c === 1 ? "cent" : `${UNITES[c]} cent${r === 0 && final ? "s" : ""}`;
  return r === 0 ? centaines : `${centaines} ${dizaines}`;
}

/** Montant en toutes lettres : 28550 → « vingt-huit mille cinq cent cinquante ». */
export function nombreEnLettres(valeur: number): string {
  let n = Math.round(Math.abs(valeur));
  if (n === 0) return "zéro";
  const parties: string[] = [];
  const milliards = Math.floor(n / 1e9); n %= 1e9;
  const millions = Math.floor(n / 1e6); n %= 1e6;
  const milliers = Math.floor(n / 1e3); const reste = n % 1e3;
  if (milliards) parties.push(`${troisChiffres(milliards, true)} milliard${milliards > 1 ? "s" : ""}`);
  if (millions) parties.push(`${troisChiffres(millions, true)} million${millions > 1 ? "s" : ""}`);
  // « mille » est invariable et ne prend pas « un » devant
  if (milliers) parties.push(milliers === 1 ? "mille" : `${troisChiffres(milliers, false)} mille`);
  if (reste) parties.push(troisChiffres(reste, true));
  return parties.join(" ");
}

/** Formule d'usage : « Arrêtée la présente facture à la somme de … francs CFA ». */
export function sommeEnLettres(total: number, symbole: string): string {
  const monnaie = /fcfa|cfa|xof/i.test(symbole) ? "francs CFA" : symbole;
  const texte = nombreEnLettres(total);
  return `Arrêtée la présente facture à la somme de ${texte.charAt(0).toUpperCase()}${texte.slice(1)} ${monnaie}.`;
}
