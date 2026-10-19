import { sansAccent } from "@/lib/format";

/**
 * Compréhension d'une commande dictée : « 3 Castel 12, 2 Béninoise petite et 5 Pils Togo 24 pour Bar Le Triomphe ».
 * Fonctions pures (pas de navigateur) : testées dans tests/dictee.test.ts.
 */

export interface FormatDictee { id: string; volume: number; unite: string; emballage_id?: string | null }
export interface ProduitDictee { id: string; nom: string; formats: FormatDictee[] }
export interface ClientDictee { id: string; nom: string }

export interface LigneComprise {
  texte: string;              // le morceau de phrase d'origine
  quantite: number;
  produit: ProduitDictee | null;
  /** Formats possibles après les indices (casier, taille) ; un seul = compris */
  formats: FormatDictee[];
  /** Autres produits possibles quand le nom est ambigu (« Pils » → Bénin ou Togo), avec leurs formats possibles */
  autresProduits: ProduitDictee[];
  autres: { produit: ProduitDictee; formats: FormatDictee[] }[];
}

const NOMBRES: Record<string, number> = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10,
  onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, "dix-sept": 17, "dix-huit": 18, "dix-neuf": 19,
  vingt: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60,
};
// Mots qui ne sont pas des noms de produits
const VIDES = new Set(["de", "des", "du", "la", "le", "les", "l", "d", "en", "et", "a", "au", "aux", "avec", "casier", "casiers", "caisse", "caisses",
  "bouteille", "bouteilles", "litre", "litres", "cl", "centilitres", "x", "fois", "s'il", "vous", "plait", "svp", "mettez", "mets", "donne", "donnez", "moi", "il", "faut", "veux", "voudrais"]);

/** Texte normalisé, nombres écrits en lettres convertis (« trois » → 3, « zéro virgule cinq » → 0.5). */
export function normaliser(texte: string): string {
  let t = sansAccent(texte).replace(/[’']/g, " ").replace(/(\d),(\d)/g, "$1.$2");
  t = t.replace(/\bvirgule\b/g, ".").replace(/\bzero\b/g, "0");
  t = t.replace(/\b(soixante|quatre-vingt)-(dix|onze|douze|treize|quatorze|quinze|seize|dix-sept|dix-huit|dix-neuf)\b/g, (_m, a, b) =>
    String((a === "soixante" ? 60 : 80) + (NOMBRES[b] ?? 0)));
  t = t.replace(/\b(vingt|trente|quarante|cinquante|soixante)(?:-| et )(un|une|deux|trois|quatre|cinq|six|sept|huit|neuf)\b/g, (_m, a, b) => String(NOMBRES[a] + NOMBRES[b]));
  t = t.replace(/\b(dix-sept|dix-huit|dix-neuf|[a-z]+)\b/g, m => (m in NOMBRES ? String(NOMBRES[m]) : m));
  t = t.replace(/(\d)\s*\.\s*(\d)/g, "$1.$2");
  return t.replace(/[^a-z0-9.\s-]/g, " ").replace(/\s+/g, " ").trim();
}

/** Distance d'édition (petites fautes de reconnaissance : « beninois » / « beninoise »). */
function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const motsDe = (t: string) => normaliser(t).split(/[\s-]+/).filter(m => m && !VIDES.has(m) && !/^\d/.test(m));
const semblable = (a: string, b: string) => a === b || (a.length >= 3 && b.startsWith(a)) || (b.length >= 3 && a.startsWith(b))
  || (Math.min(a.length, b.length) >= 5 && distance(a, b) <= 2) || (Math.min(a.length, b.length) >= 4 && distance(a, b) <= 1);

/** Note de ressemblance entre des mots dits et un nom (0 = rien à voir). */
function note(mots: string[], nom: string): number {
  const cible = motsDe(nom);
  if (!cible.length || !mots.length) return 0;
  let trouves = 0;
  for (const c of cible) if (mots.some(m => semblable(m, c))) trouves++;
  if (!trouves) return 0;
  // Tous les mots du nom retrouvés vaut mieux qu'une partie (« pils togo » > « pils »)
  return trouves / cible.length + trouves * 0.01;
}

/** Indices de format dans un morceau de phrase : casier, taille de bouteille, canette, pack. */
function filtrerFormats(formats: FormatDictee[], morceau: string): FormatDictee[] {
  const t = ` ${morceau} `;
  const nombres = [...morceau.matchAll(/\b\d+(?:\.\d+)?\b/g)].map(m => Number(m[0]));
  const essais: ((f: FormatDictee) => boolean)[] = [];
  const casier = nombres.find(n => n === 12 || n === 20 || n === 24);
  if (casier) essais.push(f => f.emballage_id === `casier-${casier}`);
  const volume = nombres.map(n => (n === 33 ? 0.33 : n === 50 ? 0.5 : n === 66 ? 0.66 : n)).find(v => [0.33, 0.5, 0.66, 1, 1.5].includes(v));
  if (volume) essais.push(f => f.volume === volume && f.unite === "L");
  if (/ petit(e|s)? /.test(t)) essais.push(f => f.volume === 0.33);
  if (/ (grand|grande|grands|grandes|gros|grosse) /.test(t)) essais.push(f => f.volume === 0.66 || (f.volume === 0.5 && f.emballage_id === "casier-12"));
  if (/ (demi|moyen|moyenne) /.test(t)) essais.push(f => f.volume === 0.5);
  if (/ (canette|canettes|carton|cartons) /.test(t)) essais.push(f => f.unite === "canette");
  if (/ (pack|packs|paquet|plastique|pet) /.test(t)) essais.push(f => f.unite === "pack");
  let reste = formats;
  for (const essai of essais) {
    const filtres = reste.filter(essai);
    if (filtres.length) reste = filtres;
  }
  return reste;
}

/** Coupe la phrase en articles : « et », virgules, ou un nouveau nombre suivi d'un nom. */
function decouper(t: string): string[] {
  const parties = t.split(/\s*(?:,|;|\bet\b|\bpuis\b|\bplus\b|\bensuite\b|\baussi\b)\s*/).filter(Boolean);
  const morceaux: string[] = [];
  for (const p of parties) {
    const mots = p.split(" ");
    let courant: string[] = [];
    for (let i = 0; i < mots.length; i++) {
      const m = mots[i], suivant = mots[i + 1];
      const nouvelArticle = /^\d+$/.test(m) && suivant && !/^\d/.test(suivant) && !VIDES.has(suivant)
        && courant.some(x => !/^\d/.test(x) && !VIDES.has(x));
      if (nouvelArticle) { morceaux.push(courant.join(" ")); courant = []; }
      courant.push(m);
    }
    if (courant.length) morceaux.push(courant.join(" "));
  }
  return morceaux.map(m => m.trim()).filter(m => /[a-z]/.test(m));
}

/** Sépare « … pour <client> » du reste de la commande. */
export function trouverClient(texte: string, clients: ClientDictee[]): { client: ClientDictee | null; reste: string } {
  const t = normaliser(texte);
  const i = t.lastIndexOf(" pour ");
  if (i < 0) return { client: null, reste: t };
  const nom = t.slice(i + 6), mots = motsDe(nom);
  const meilleurs = clients.map(c => ({ c, n: note(mots, c.nom) })).filter(x => x.n >= 0.5).sort((a, b) => b.n - a.n);
  return { client: meilleurs[0]?.c ?? null, reste: meilleurs.length ? t.slice(0, i) : t };
}

/** La commande comprise, ligne par ligne. */
export function comprendre(texte: string, produits: ProduitDictee[], clients: ClientDictee[] = []) {
  const { client, reste } = trouverClient(texte, clients);
  const lignes: LigneComprise[] = decouper(reste).map(morceau => {
    const premier = morceau.match(/^(\d+)\b/);
    const quantite = premier ? Math.max(1, parseInt(premier[1], 10)) : 1;
    const corps = premier ? morceau.slice(premier[0].length).trim() : morceau;
    const mots = motsDe(corps);
    const notes = produits.filter(p => p.formats.length).map(p => ({ p, n: note(mots, p.nom) })).filter(x => x.n >= 0.5).sort((a, b) => b.n - a.n);
    const meilleur = notes[0];
    const exaequo = notes.filter(x => meilleur && Math.abs(x.n - meilleur.n) < 0.001).map(x => x.p);
    const produit = meilleur?.p ?? null;
    return {
      texte: morceau, quantite, produit,
      formats: produit ? filtrerFormats(produit.formats, corps) : [],
      autresProduits: exaequo.length > 1 ? exaequo.filter(p => p !== produit) : [],
      autres: exaequo.length > 1 ? exaequo.filter(p => p !== produit).map(p => ({ produit: p, formats: filtrerFormats(p.formats, corps) })) : [],
    };
  });
  return { client, lignes };
}
