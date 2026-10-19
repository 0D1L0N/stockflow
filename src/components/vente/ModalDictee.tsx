import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, MicOff, Check, X, AlertTriangle, ShoppingCart, User, Lightbulb } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { useAppStore } from "@/stores/appStore";
import { volumeFr } from "@/lib/format";
import { comprendre, type ClientDictee } from "@/lib/dictee";
import type { Format } from "@/lib/api/catalogue";

interface Produit { produit: { id: string; nom: string }; formats: Format[] }
export interface ArticleDicte { format: Format; produitNom: string; quantite: number }

interface Props {
  isOpen: boolean;
  onClose: () => void;
  produits: Produit[];
  clients: ClientDictee[];
  prixDe: (f: Format) => number;
  onAjouter: (articles: ArticleDicte[], clientId: string | null) => void;
}

// Reconnaissance vocale du navigateur (Chrome sur Android : en ligne, en français)
type Reconnaissance = {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  start: () => void; stop: () => void; abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
const ClasseReconnaissance = (): (new () => Reconnaissance) | null => {
  const w = window as unknown as { SpeechRecognition?: new () => Reconnaissance; webkitSpeechRecognition?: new () => Reconnaissance };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

const MESSAGES_ERREUR: Record<string, string> = {
  "not-allowed": "Autorisez le micro pour StockFlow (réglages du navigateur), puis réessayez.",
  "service-not-allowed": "Autorisez le micro pour StockFlow (réglages du navigateur), puis réessayez.",
  "no-speech": "Je n'ai rien entendu. Touchez le micro et parlez juste après.",
  "network": "La dictée a besoin d'Internet. Vous pouvez aussi écrire la commande.",
  "audio-capture": "Aucun micro trouvé sur cet appareil.",
};

interface Choix { produitId: string; formatId: string }

/**
 * Commande dictée : on parle, l'app rédige la commande, on corrige si besoin, puis on l'ajoute au panier.
 * Le texte reste modifiable au clavier (utile sans réseau ou si un mot a mal été compris).
 */
export default function ModalDictee({ isOpen, onClose, produits, clients, prixDe, onAjouter }: Props) {
  const formatPrix = useAppStore((s) => s.formatMontant);
  const [texte, setTexte] = useState("");
  const [provisoire, setProvisoire] = useState("");
  const [ecoute, setEcoute] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [choix, setChoix] = useState<Record<number, Choix>>({});
  const [quantites, setQuantites] = useState<Record<number, string>>({});
  const [retirees, setRetirees] = useState<Set<number>>(new Set());
  const [clientRetire, setClientRetire] = useState(false);
  const reco = useRef<Reconnaissance | null>(null);
  const disponible = !!ClasseReconnaissance();

  useEffect(() => {
    if (!isOpen) { reco.current?.abort(); return; }
    setTexte(""); setProvisoire(""); setErreur(null); setChoix({}); setQuantites({}); setRetirees(new Set()); setClientRetire(false);
  }, [isOpen]);

  const ecouter = () => {
    if (ecoute) { reco.current?.stop(); return; }
    const Classe = ClasseReconnaissance();
    if (!Classe) return;
    const r = new Classe();
    r.lang = "fr-FR"; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
    r.onresult = e => {
      let final = "", interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) final += res[0].transcript; else interim += res[0].transcript;
      }
      setProvisoire(interim);
      // Chaque nouvelle phrase s'ajoute à la commande (on peut dicter en plusieurs fois)
      if (final) setTexte(t => (t ? `${t}, ${final.trim()}` : final.trim()));
    };
    r.onerror = e => setErreur(MESSAGES_ERREUR[e.error] ?? "La dictée s'est arrêtée. Réessayez.");
    r.onend = () => { setEcoute(false); setProvisoire(""); };
    setErreur(null); setEcoute(true);
    reco.current = r;
    try { r.start(); } catch { setEcoute(false); }
  };

  const compris = useMemo(() => comprendre(texte, produits.map(p => ({ id: p.produit.id, nom: p.produit.nom, formats: p.formats })), clients), [texte, produits, clients]);
  // Quand le texte change, les choix faits à la main sur les anciennes lignes ne valent plus
  useEffect(() => { setChoix({}); setQuantites({}); setRetirees(new Set()); }, [texte]);

  const parId = useMemo(() => new Map(produits.map(p => [p.produit.id, p])), [produits]);
  const libelle = (f: Format) => volumeFr(f.volume, f.unite, f.casier);

  // Chaque ligne : produit et format retenus (choix de l'utilisateur, sinon le seul possible)
  const lignes = compris.lignes.map((l, i) => {
    const c = choix[i];
    const produit = c ? parId.get(c.produitId) ?? null : l.produit ? parId.get(l.produit.id) ?? null : null;
    // Nom ambigu (« pils ») : on ne choisit pas à la place du vendeur
    const ambigu = l.autres.length > 0;
    const format = c ? produit?.formats.find(f => f.id === c.formatId) ?? null
      : !ambigu && l.formats.length === 1 ? produit?.formats.find(f => f.id === l.formats[0].id) ?? null : null;
    const candidats = [...(l.produit ? [{ produit: l.produit, formats: l.formats }] : []), ...l.autres];
    const options = candidats.flatMap(({ produit: p, formats: fs }) => {
      const pf = parId.get(p.id);
      return pf ? fs.map(f => ({ produitId: p.id, formatId: f.id, label: `${pf.produit.nom} ${libelle(pf.formats.find(x => x.id === f.id) as Format)}` })) : [];
    });
    const quantite = Math.max(1, parseInt(quantites[i] ?? String(l.quantite)) || 1);
    return { i, texte: l.texte, quantite, produit, format, options };
  }).filter(l => !retirees.has(l.i));

  const prets = lignes.filter(l => l.produit && l.format && prixDe(l.format) > 0);
  const client = clientRetire ? null : compris.client;
  const total = prets.reduce((t, l) => t + l.quantite * prixDe(l.format!), 0);

  const ajouter = () => {
    onAjouter(prets.map(l => ({ format: l.format!, produitNom: l.produit!.produit.nom, quantite: l.quantite })), client?.id ?? null);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Dicter la commande" size="lg">
      <div className="p-4 sm:p-6 flex flex-col gap-4">
        {/* Comment parler */}
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-[13px] text-gray-600 flex gap-2.5">
          <Lightbulb size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            Dites la <b>quantité</b>, la <b>boisson</b> et le <b>casier</b> (12, 20, 24) ou la taille (petite, grande), puis « <b>pour</b> » et le client si besoin.
            <div className="mt-1 text-gray-500 italic">« 3 Castel 12, 2 Béninoise petite et 5 Pils Togo 24 pour Bar Le Triomphe »</div>
          </div>
        </div>

        {/* Micro */}
        <div className="flex flex-col items-center gap-2">
          {disponible ? (
            <>
              <button onClick={ecouter} aria-label={ecoute ? "Arrêter l'écoute" : "Parler"}
                className={["w-20 h-20 rounded-full flex items-center justify-center text-white shadow-lg transition-transform active:scale-95",
                  ecoute ? "bg-danger animate-pulse" : "bg-secondary-600 hover:bg-secondary-700"].join(" ")}>
                {ecoute ? <MicOff size={32} /> : <Mic size={32} />}
              </button>
              <div className="text-sm font-semibold text-gray-700">{ecoute ? "J'écoute… touchez pour arrêter" : texte ? "Touchez pour ajouter d'autres articles" : "Touchez et parlez"}</div>
              {provisoire && <div className="text-sm text-gray-400 italic text-center">« {provisoire} »</div>}
            </>
          ) : (
            <p className="text-sm text-amber-800 bg-amber-50 rounded-xl px-3 py-2 text-center">
              La dictée n'est pas disponible sur ce navigateur (elle marche avec Chrome sur Android). Vous pouvez écrire la commande ci-dessous.
            </p>
          )}
          {erreur && <p className="text-sm text-danger text-center">{erreur}</p>}
        </div>

        {/* Ce qui a été entendu, corrigeable */}
        <div>
          <label className="text-[13px] font-medium text-gray-700 block mb-1.5">Ce que j'ai compris (modifiable)</label>
          <textarea value={texte} onChange={e => setTexte(e.target.value)} rows={2} placeholder="ex. : 3 castel 12, 2 béninoise petite"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-[15px] focus:outline-none focus:border-secondary" />
        </div>

        {/* Client reconnu */}
        {client && (
          <div className="flex items-center gap-2 rounded-xl bg-secondary-50 text-secondary-800 px-3 py-2 text-sm">
            <User size={15} /> <span className="flex-1">Client : <b>{client.nom}</b><span className="block text-xs text-secondary-700">Ses prix seront appliqués dans le panier</span></span>
            <button onClick={() => setClientRetire(true)} aria-label="Ne pas changer de client" className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary-100"><X size={15} /></button>
          </div>
        )}

        {/* Commande rédigée */}
        {lignes.length > 0 && (
          <div className="flex flex-col divide-y divide-slate-100 border border-slate-200 rounded-xl">
            {lignes.map(l => {
              const prix = l.format ? prixDe(l.format) : 0;
              const etat = !l.produit ? "inconnu" : !l.format ? "preciser" : prix <= 0 ? "sansprix" : "ok";
              return (
                <div key={l.i} className="flex items-start gap-2.5 px-3 py-2.5">
                  <span className={["w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-1.5",
                    etat === "ok" ? "bg-emerald-100 text-emerald-700" : etat === "inconnu" ? "bg-red-100 text-danger" : "bg-amber-100 text-amber-700"].join(" ")}>
                    {etat === "ok" ? <Check size={13} /> : <AlertTriangle size={13} />}
                  </span>
                  <input type="number" inputMode="numeric" min="1" value={quantites[l.i] ?? String(l.quantite)} aria-label="Quantité"
                    onChange={e => setQuantites(q => ({ ...q, [l.i]: e.target.value }))} onFocus={e => e.target.select()}
                    className="w-14 h-10 rounded-lg border border-slate-300 text-center text-sm font-bold focus:outline-none focus:border-secondary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    {etat === "inconnu" ? (
                      <div className="text-sm text-danger font-semibold pt-2">Pas compris : « {l.texte} »</div>
                    ) : l.options.length > 1 ? (
                      <select value={l.format ? `${l.produit!.produit.id}|${l.format.id}` : ""} aria-label="Choisir le format"
                        onChange={e => { const [produitId, formatId] = e.target.value.split("|"); setChoix(c => ({ ...c, [l.i]: { produitId, formatId } })); }}
                        className={["w-full h-10 rounded-lg border px-2 text-sm bg-white focus:outline-none focus:border-secondary", l.format ? "border-slate-300" : "border-amber-400"].join(" ")}>
                        {!l.format && <option value="">À préciser…</option>}
                        {l.options.map(o => <option key={`${o.produitId}|${o.formatId}`} value={`${o.produitId}|${o.formatId}`}>{o.label}</option>)}
                      </select>
                    ) : (
                      <div className="text-sm font-semibold text-gray-800 pt-2 truncate">{l.produit!.produit.nom} {l.format && libelle(l.format)}</div>
                    )}
                    {etat === "ok" && (
                      <div className={["text-xs mt-0.5", l.quantite > (l.format?.stock ?? 0) ? "text-danger font-semibold" : "text-gray-400"].join(" ")}>
                        {formatPrix(prix)} le casier{l.quantite > (l.format?.stock ?? 0) ? ` · stock ${l.format?.stock} seulement` : ""}
                      </div>
                    )}
                    {etat === "sansprix" && <div className="text-xs text-amber-700 mt-0.5">Prix pas encore fixé : ne peut pas être vendu</div>}
                  </div>
                  <button onClick={() => setRetirees(s => new Set(s).add(l.i))} aria-label="Retirer cette ligne"
                    className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-danger flex-shrink-0"><X size={16} /></button>
                </div>
              );
            })}
          </div>
        )}

        <button onClick={ajouter} disabled={prets.length === 0}
          className="w-full h-12 rounded-lg bg-secondary-600 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
          <ShoppingCart size={17} />
          {prets.length === 0 ? "Rien à ajouter pour l'instant" : `Ajouter ${prets.length} article${prets.length > 1 ? "s" : ""} au panier · ${formatPrix(total)}`}
        </button>
        {lignes.length > prets.length && prets.length > 0 && (
          <p className="text-xs text-gray-500 text-center -mt-2">Les lignes en orange ou en rouge ne seront pas ajoutées tant qu'elles ne sont pas précisées.</p>
        )}
      </div>
    </Modal>
  );
}
