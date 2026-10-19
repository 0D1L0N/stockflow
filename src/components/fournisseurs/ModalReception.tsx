import { useEffect, useMemo, useState } from "react";
import { Search, Plus, Minus, Trash2, Truck, AlertTriangle, PackageCheck, ClipboardList, X } from "lucide-react";
import { invoke } from "@/lib/db";
import { useToast } from "@/components/ui/Toast";
import { useAppStore } from "@/stores/appStore";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Avatar from "@/components/ui/Avatar";
import { volumeFr, casiers } from "@/lib/format";
import { familleDe, FAMILLES } from "@/lib/familles";
import { catalogueCharge, produitsAvecFormats } from "@/stores/catalogueStore";

interface Fournisseur { id: string; nom: string; }
interface FormatChoix { casier?: number | null;
  id: string; produit_nom: string; volume: number; unite: string; stock: number;
  emballage_id: string | null; famille: string; seuil_alerte: number;
}
interface Ligne { formatId: string; quantite: string; prixAchat: string; }
interface CommandeAttente { id: string; numero: string; date: string; lignes: { format_id: string; quantite: number }[]; }

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onDone?: () => void;
  /** Fournisseur présélectionné (depuis sa fiche) */
  fournisseurId?: string | null;
  /** Commande en attente à reprendre d'office (de ce fournisseur) */
  commandeId?: string | null;
}

const champ = "w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-secondary";
const dateCourte = (d: string) => new Date(d.replace(" ", "T")).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
const totalCommande = (c: CommandeAttente) => c.lignes.reduce((t, l) => t + l.quantite, 0);

/** Saisie d'une livraison fournisseur : produits reçus, casiers échangés, paiement. */
export default function ModalReception({ isOpen, onClose, onDone, fournisseurId, commandeId: commandeInitiale }: Props) {
  const { toast } = useToast();
  const formatPrix = useAppStore((s) => s.formatMontant);
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [formats, setFormats] = useState<FormatChoix[]>([]);
  const [emballages, setEmballages] = useState<{ id: string; nom: string }[]>([]);
  const [fid, setFid] = useState("");
  const [nouveauNom, setNouveauNom] = useState("");
  const [bl, setBl] = useState("");
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [recherche, setRecherche] = useState("");
  const [rendus, setRendus] = useState<Record<string, string>>({});
  const [paye, setPaye] = useState("");
  const [commentaire, setCommentaire] = useState("");
  const [derniersPrix, setDerniersPrix] = useState<Record<string, number>>({});
  const [commandesAttente, setCommandesAttente] = useState<CommandeAttente[]>([]);
  const [commande, setCommande] = useState<CommandeAttente | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setFid(fournisseurId ?? ""); setNouveauNom(""); setBl(""); setLignes([]); setRecherche(""); setCommande(null);
    setRendus({}); setPaye(""); setCommentaire("");
    invoke<Fournisseur[]>("get_fournisseurs").then(setFournisseurs).catch(() => {});
    (async () => {
      // Catalogue partagé (déjà en mémoire) au lieu d'une requête par produit
      const catalogue = await catalogueCharge();
      setEmballages(catalogue.emballages);
      const ordre = (cle: string) => FAMILLES.findIndex(f => f.cle === cle);
      setFormats(produitsAvecFormats(catalogue).flatMap(({ produit: p, formats }) => formats.map(f => ({
        ...f, emballage_id: f.emballage_id ?? null, produit_nom: p.nom, famille: familleDe(f.emballage_id, p.rayon),
      }))).sort((a, b) => ordre(a.famille) - ordre(b.famille) || a.produit_nom.localeCompare(b.produit_nom, "fr")));
    })().catch(e => toast(String(e), "error"));
  }, [isOpen]);

  /** Lignes pré-remplies avec les quantités commandées, à corriger selon ce qui est arrivé. */
  const reprendre = (c: CommandeAttente, prix = derniersPrix) => {
    setCommande(c);
    setLignes(c.lignes.map(l => ({ formatId: l.format_id, quantite: String(l.quantite), prixAchat: prix[l.format_id] ? String(prix[l.format_id]) : "" })));
  };

  // Derniers prix d'achat et commandes en attente de ce fournisseur
  useEffect(() => {
    if (!isOpen) return;
    setCommande(null); setCommandesAttente([]);
    if (!fid) { setDerniersPrix({}); return; }
    let annule = false;
    Promise.all([
      invoke<Record<string, number>>("get_derniers_prix_achat", { fournisseurId: fid }).catch(() => ({} as Record<string, number>)),
      invoke<CommandeAttente[]>("get_commandes_fournisseur", { fournisseurId: fid, statut: "envoyée" }).catch(() => [] as CommandeAttente[]),
    ]).then(([prix, cmds]) => {
      if (annule) return;
      setDerniersPrix(prix); setCommandesAttente(cmds);
      const aReprendre = cmds.find(c => c.id === commandeInitiale);
      if (aReprendre) reprendre(aReprendre, prix);
    });
    return () => { annule = true; };
  }, [isOpen, fid]);

  const parId = useMemo(() => new Map(formats.map(f => [f.id, f])), [formats]);
  const libelle = (f: FormatChoix) => `${f.produit_nom} ${volumeFr(f.volume, f.unite, f.casier)}`;
  const nomFamille = (cle: string) => FAMILLES.find(f => f.cle === cle)?.court ?? "";
  const nomEmballage = (id: string) => emballages.find(e => e.id === id)?.nom ?? id;

  const ajouter = (f: FormatChoix, quantite = 1) => {
    setLignes(ls => ls.some(l => l.formatId === f.id)
      ? ls.map(l => l.formatId === f.id ? { ...l, quantite: String((parseInt(l.quantite) || 0) + quantite) } : l)
      : [...ls, { formatId: f.id, quantite: String(quantite), prixAchat: derniersPrix[f.id] ? String(derniersPrix[f.id]) : "" }]);
    setRecherche("");
  };
  const modifier = (formatId: string, champs: Partial<Ligne>) => setLignes(ls => ls.map(l => l.formatId === formatId ? { ...l, ...champs } : l));

  /** Produits en alerte, avec la quantité manquante. */
  const ajouterAlertes = () => {
    const enAlerte = formats.filter(f => f.stock <= f.seuil_alerte);
    if (!enAlerte.length) { toast("Aucun produit en alerte", "info"); return; }
    enAlerte.forEach(f => { if (!lignes.some(l => l.formatId === f.id)) ajouter(f, Math.max(1, f.seuil_alerte - f.stock)); });
  };

  const resultats = recherche.trim()
    ? formats.filter(f => libelle(f).toLowerCase().includes(recherche.toLowerCase())).slice(0, 8)
    : [];

  const total = lignes.reduce((t, l) => t + (parseInt(l.quantite) || 0) * (parseFloat(l.prixAchat) || 0), 0);
  const livres: Record<string, number> = {};
  for (const l of lignes) {
    const e = parId.get(l.formatId)?.emballage_id;
    if (e) livres[e] = (livres[e] ?? 0) + (parseInt(l.quantite) || 0);
  }
  // Par défaut on rend autant de casiers vides qu'on en reçoit de pleins
  const rendu = (e: string) => rendus[e] ?? String(livres[e] ?? 0);
  const payeNombre = paye === "" ? 0 : parseFloat(paye) || 0;
  const reste = Math.max(0, total - payeNombre);
  const nbCasiers = lignes.reduce((t, l) => t + (parseInt(l.quantite) || 0), 0);

  const valider = async () => {
    if (lignes.length === 0) { toast("Ajoutez les produits reçus", "warning"); return; }
    setSaving(true);
    try {
      let fournisseur = fid;
      if (!fournisseur) {
        if (!nouveauNom.trim()) { toast("Choisissez le fournisseur", "warning"); setSaving(false); return; }
        fournisseur = await invoke<string>("create_fournisseur", { nom: nouveauNom.trim() });
      }
      const res = await invoke<{ numero: string; reste_du: number }>("creer_reception", {
        fournisseurId: fournisseur, numeroBl: bl,
        lignes: lignes.map(l => ({ formatId: l.formatId, quantite: parseInt(l.quantite) || 0, prixAchat: parseFloat(l.prixAchat) || 0 })),
        montantPaye: payeNombre,
        emballagesRendus: Object.fromEntries(Object.keys(livres).map(e => [e, parseInt(rendu(e)) || 0])),
        commentaire,
        commandeId: commande?.id ?? null,
      });
      toast(`Livraison ${res.numero} enregistrée : ${casiers(nbCasiers)} ajoutés au stock${commande ? ` · commande ${commande.numero} reçue` : ""}`, "success");
      onDone?.();
      onClose();
    } catch (e) { toast(String(e), "error"); }
    setSaving(false);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Réceptionner une livraison" size="lg">
      <div className="p-4 sm:p-6 flex flex-col gap-5">
        {/* Fournisseur et bon de livraison */}
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[13px] font-medium text-gray-700 block mb-1.5">Fournisseur</label>
            <select value={fid} onChange={e => setFid(e.target.value)} className={champ}>
              <option value="">{fournisseurs.length ? "— Choisir —" : "Nouveau fournisseur…"}</option>
              {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
            </select>
            {!fid && (
              <input value={nouveauNom} onChange={e => setNouveauNom(e.target.value)} placeholder="ou nom d'un nouveau fournisseur"
                className={champ + " mt-2"} />
            )}
          </div>
          <Input label="N° du bon de livraison (facultatif)" value={bl} onChange={e => setBl(e.target.value)} placeholder="ex. : BL 2026-418" />
        </div>

        {/* Commande envoyée à ce fournisseur */}
        {commande ? (
          <div className="flex items-start gap-2.5 rounded-xl bg-secondary-50 text-secondary-800 px-3 py-2.5 text-sm">
            <ClipboardList size={17} className="flex-shrink-0 mt-0.5" />
            <span className="flex-1">
              Commande <b>{commande.numero}</b> reprise : corrigez les quantités selon ce qui est vraiment arrivé.
            </span>
            <button onClick={() => setCommande(null)} aria-label="Ne plus lier à la commande"
              className="p-1 -m-1 rounded-lg hover:bg-secondary-100"><X size={15} /></button>
          </div>
        ) : commandesAttente.length > 0 && (
          <section className="rounded-xl border border-secondary-200 bg-secondary-50/50 p-3 flex flex-col gap-2">
            <h3 className="text-[13px] font-bold text-ink-900 flex items-center gap-2">
              <ClipboardList size={15} className="text-secondary-700" /> Reprendre une commande en attente
            </h3>
            {commandesAttente.map(c => (
              <button key={c.id} onClick={() => reprendre(c)}
                className="flex items-center gap-3 rounded-lg bg-white border border-slate-200 px-3 py-2 text-left hover:border-secondary">
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-gray-800 truncate">{c.numero}</span>
                  <span className="block text-xs text-gray-400">Envoyée le {dateCourte(c.date)} · {c.lignes.length} produit{c.lignes.length > 1 ? "s" : ""}</span>
                </span>
                <span className="text-sm font-bold text-secondary-700 flex-shrink-0">{casiers(totalCommande(c))}</span>
              </button>
            ))}
          </section>
        )}

        {/* Produits reçus */}
        <section className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[13px] font-bold uppercase tracking-wide text-ink-600">Produits reçus</h3>
            <button onClick={ajouterAlertes} className="flex items-center gap-1.5 text-xs font-semibold text-secondary-700 hover:underline">
              <AlertTriangle size={13} /> Ajouter les produits en alerte
            </button>
          </div>
          <div className="relative">
            <Input placeholder="Chercher un produit à ajouter…" value={recherche} onChange={e => setRecherche(e.target.value)} icon={<Search size={16} />} />
            {resultats.length > 0 && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                {resultats.map(f => (
                  <button key={f.id} onClick={() => ajouter(f)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 border-b border-slate-100 last:border-0">
                    <Avatar nom={f.produit_nom} taille="sm" />
                    <span className="flex-1 min-w-0 text-sm font-semibold text-gray-800 truncate">{libelle(f)}</span>
                    <span className="text-[11px] text-gray-400 flex-shrink-0">{nomFamille(f.famille)} · stock {f.stock}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {lignes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 py-8 text-center text-sm text-gray-400">
              <Truck size={22} className="mx-auto mb-2 text-gray-300" />
              Cherchez les produits livrés ou ajoutez ceux en alerte.
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-slate-100 border border-slate-200 rounded-xl">
              {lignes.map(l => {
                const f = parId.get(l.formatId);
                if (!f) return null;
                const q = parseInt(l.quantite) || 0;
                const commandee = commande ? commande.lignes.find(x => x.format_id === l.formatId)?.quantite ?? 0 : null;
                return (
                  <div key={l.formatId} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
                    <div className="flex-1 min-w-[140px]">
                      <div className="text-sm font-semibold text-gray-800 truncate">{libelle(f)}</div>
                      <div className="text-xs text-gray-400">
                        Stock {f.stock} → {f.stock + q}
                        {commandee !== null && (
                          <span className={commandee === q ? "" : "text-amber-700 font-semibold"}>
                            {commandee ? ` · commandé ${commandee}` : " · hors commande"}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden">
                      <button aria-label="Un de moins" onClick={() => modifier(l.formatId, { quantite: String(Math.max(1, q - 1)) })}
                        className="w-8 h-8 bg-slate-50 flex items-center justify-center hover:bg-gray-100"><Minus size={12} /></button>
                      <input type="number" min="1" value={l.quantite} aria-label="Quantité reçue"
                        onChange={e => modifier(l.formatId, { quantite: e.target.value })}
                        className="w-12 h-8 text-center text-sm font-semibold focus:outline-none" />
                      <button aria-label="Un de plus" onClick={() => modifier(l.formatId, { quantite: String(q + 1) })}
                        className="w-8 h-8 bg-slate-50 flex items-center justify-center hover:bg-gray-100"><Plus size={12} /></button>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-400">×</span>
                      <input type="number" min="0" value={l.prixAchat} placeholder="Prix achat" aria-label="Prix d'achat unitaire"
                        onChange={e => modifier(l.formatId, { prixAchat: e.target.value })}
                        className="w-24 h-8 rounded-lg border border-slate-300 px-2 text-sm font-semibold text-right focus:outline-none focus:border-secondary" />
                    </div>
                    <span className="chiffre text-sm font-bold text-ink-900 w-24 text-right">{formatPrix(q * (parseFloat(l.prixAchat) || 0))}</span>
                    <button aria-label={`Retirer ${f.produit_nom}`} onClick={() => setLignes(ls => ls.filter(x => x.formatId !== l.formatId))}
                      className="p-1.5 rounded-lg text-gray-300 hover:bg-red-50 hover:text-danger"><Trash2 size={14} /></button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Casiers échangés */}
        {Object.keys(livres).length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-[13px] font-bold uppercase tracking-wide text-ink-600">Casiers vides rendus au fournisseur</h3>
            {Object.keys(livres).map(e => {
              const r = parseInt(rendu(e)) || 0;
              const net = livres[e] - r;
              return (
                <div key={e} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-800">{nomEmballage(e)}</div>
                    <div className={["text-xs", net > 0 ? "text-amber-700" : net < 0 ? "text-emerald-700" : "text-gray-400"].join(" ")}>
                      {livres[e]} plein{livres[e] > 1 ? "s" : ""} reçu{livres[e] > 1 ? "s" : ""}
                      {net > 0 ? ` · ${net} à lui rendre plus tard` : net < 0 ? ` · ${-net} rendu${-net > 1 ? "s" : ""} en avance` : " · échange complet"}
                    </div>
                  </div>
                  <input type="number" min="0" value={rendu(e)} aria-label={`Vides rendus ${nomEmballage(e)}`}
                    onChange={ev => setRendus(x => ({ ...x, [e]: ev.target.value }))}
                    className="w-20 h-9 rounded-lg border border-slate-300 px-2 text-sm font-semibold text-right focus:outline-none focus:border-secondary" />
                </div>
              );
            })}
          </section>
        )}

        {/* Paiement */}
        <section className="rounded-2xl bg-ink-900 text-white p-4 flex flex-col gap-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-ink-400">Total de la livraison</div>
              <div className="text-xs text-ink-300 mt-0.5">{casiers(nbCasiers)}</div>
            </div>
            <div className="chiffre text-[26px] font-extrabold text-secondary-400 leading-none">{formatPrix(total)}</div>
          </div>
          <div className="flex items-center gap-2">
            <input type="number" min="0" value={paye} onChange={e => setPaye(e.target.value)} placeholder="Montant payé maintenant"
              className="flex-1 min-w-0 h-10 rounded-lg bg-white/10 border border-white/15 px-3 text-sm font-semibold placeholder:text-ink-400 focus:outline-none focus:border-secondary-400" />
            <button onClick={() => setPaye(String(total))} className="h-10 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold">Tout payé</button>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-ink-300">Reste dû au fournisseur</span>
            <span className={["chiffre font-bold", reste > 0 ? "text-amber-300" : "text-white"].join(" ")}>{formatPrix(reste)}</span>
          </div>
        </section>

        <Input label="Commentaire (facultatif)" value={commentaire} onChange={e => setCommentaire(e.target.value)} placeholder="ex. : 2 casiers abîmés" />

        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button icon={<PackageCheck size={16} />} onClick={valider} loading={saving} disabled={lignes.length === 0}>
            Valider et ajouter au stock
          </Button>
        </div>
      </div>
    </Modal>
  );
}
