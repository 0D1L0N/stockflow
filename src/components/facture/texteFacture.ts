import type { FactureData, FactureItem } from "./FacturePDF";

/** Mode de paiement réel : comptant, paiement partiel ou à crédit. */
export function modePaiement(data: FactureData): string {
  const a = data.compte?.argent;
  if (data.livraison?.ouverte) return "À la livraison";
  if (!a || a.nouveau <= 0) return "Espèces";
  return a.paye > 0 ? "Espèces · paiement partiel" : "À crédit";
}

// Casier habituel selon le volume de la bouteille (comme les types d'emballage par défaut)
const CASIER_DEFAUT: Record<number, number> = { 0.33: 24, 0.5: 20, 0.66: 12 };
const arrondi = (n: number) => Math.round(n * 100) / 100;

/** Les articles d'un même format (0,5 L · casier de 12, packs…), avec leur sous-total. */
export interface GroupeFacture {
  cle: string; titre: string;
  /** Casier consigné : le client rend les vides. Packs et canettes : emballage perdu */
  consigne: boolean;
  items: FactureItem[]; quantite: number; montant: number;
}

function familleArticle(i: FactureItem): { cle: string; titre: string; ordre: number; consigne: boolean } {
  if (i.unite === "pack") return { cle: "pack", titre: "Packs", ordre: 9000, consigne: false };
  if (i.unite === "canette") return { cle: "canette", titre: "Canettes", ordre: 9500, consigne: false };
  if (i.litres == null) return { cle: "articles", titre: "Articles", ordre: 9900, consigne: true };
  // Rangement par casier, quelle que soit la bouteille : 0,5 L et 0,66 L en casier de 12 vont ensemble
  const casier = i.casier ?? CASIER_DEFAUT[i.litres];
  if (!casier) return { cle: `l-${i.litres}`, titre: `${i.litres.toLocaleString("fr-FR")} L`, ordre: 5000 + i.litres, consigne: true };
  return { cle: `casier-${casier}`, titre: `Casiers de ${casier}`, ordre: 1000 - casier, consigne: true };
}

/** Précision sous le nom : la bouteille pour les casiers (0,66 L), le conditionnement sinon (pack de 6). */
export function detailArticle(i: FactureItem, consigne: boolean): string {
  if (!consigne) return i.volume;
  return i.litres != null ? `${i.litres.toLocaleString("fr-FR")} L` : i.volume;
}

/** Articles rangés par casier (24, 20, 12…), puis packs et canettes ; par nom puis bouteille dans chaque groupe. */
export function groupesFacture(data: FactureData): GroupeFacture[] {
  const groupes = new Map<string, GroupeFacture & { ordre: number }>();
  for (const item of data.items) {
    const f = familleArticle(item);
    const g = groupes.get(f.cle) ?? { cle: f.cle, titre: f.titre, ordre: f.ordre, consigne: f.consigne, items: [], quantite: 0, montant: 0 };
    g.items.push(item);
    g.quantite = arrondi(g.quantite + item.quantite);
    g.montant += item.sous_total;
    groupes.set(f.cle, g);
  }
  return [...groupes.values()].sort((a, b) => a.ordre - b.ordre)
    .map(({ ordre: _o, ...g }) => ({ ...g, items: [...g.items].sort((a, b) => a.nom_produit.localeCompare(b.nom_produit, "fr") || (a.litres ?? 0) - (b.litres ?? 0)) }));
}

/**
 * Emballages de la facture. Seuls les casiers sont consignés (somme exacte : 5,5 reste 5,5) ;
 * packs et cartons de canettes partent avec le client et ne se rendent pas.
 */
export function emballagesFacture(data: FactureData): { consignes: number; nonConsignes: number } {
  let consignes = 0, nonConsignes = 0;
  for (const g of groupesFacture(data)) {
    if (g.consigne) consignes = arrondi(consignes + g.quantite);
    else nonConsignes = arrondi(nonConsignes + g.quantite);
  }
  return { consignes, nonConsignes };
}

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
