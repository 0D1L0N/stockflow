import { useEffect, useState } from "react";
import { Wallet, Truck, ChevronDown, ChevronRight, PackageCheck, ClipboardList } from "lucide-react";
import { invoke } from "@/lib/db";
import { useToast } from "@/components/ui/Toast";
import { useAppStore } from "@/stores/appStore";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import { volumeFr, casiers } from "@/lib/format";

interface Ligne { casier?: number | null; format_id: string; produit_nom: string; volume: number; unite: string; quantite: number; prix_achat: number; sous_total: number; }
interface Reception {
  id: string; numero: string; numero_bl: string | null; date: string; total: number; montant_paye: number; reste_du: number;
  lignes: Ligne[]; emballages_livres: Record<string, number>; emballages_rendus: Record<string, number>;
  commentaire: string | null; utilisateur_nom: string;
}
interface Operation {
  id: string; type: "réception" | "paiement"; montant: number; emballages: Record<string, number>;
  numero: string | null; commentaire: string | null; date: string; utilisateur_nom: string;
}
interface CommandeAttente { casier?: number | null;
  id: string; numero: string; date: string; utilisateur_nom: string;
  lignes: { format_id: string; produit_nom: string; volume: number; unite: string; quantite: number; casier?: number | null }[];
}
interface Compte {
  fournisseur: { id: string; nom: string; telephone: string | null; solde_argent?: number; emballages_dus?: Record<string, number> };
  operations: Operation[]; receptions: Reception[]; commandes_en_attente: CommandeAttente[];
}

interface Props {
  fournisseur: { id: string; nom: string } | null;
  onClose: () => void;
  onChange?: () => void;
  /** Ouvre la saisie d'une livraison pour ce fournisseur, éventuellement en reprenant une commande */
  onReception?: (id: string, commandeId?: string) => void;
}

const dateCourte = (d: string) => new Date(d.replace(" ", "T")).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Compte d'un fournisseur : ce qu'on lui doit, règlement, livraisons et journal. */
export default function ModalCompteFournisseur({ fournisseur, onClose, onChange, onReception }: Props) {
  const { toast } = useToast();
  const formatPrix = useAppStore((s) => s.formatMontant);
  const [compte, setCompte] = useState<Compte | null>(null);
  const [emballages, setEmballages] = useState<{ id: string; nom: string }[]>([]);
  const [onglet, setOnglet] = useState<"livraisons" | "journal">("livraisons");
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [montant, setMontant] = useState("");
  const [rendus, setRendus] = useState<Record<string, string>>({});
  const [commentaire, setCommentaire] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!fournisseur) return;
    try { setCompte(await invoke<Compte>("get_compte_fournisseur", { fournisseurId: fournisseur.id })); }
    catch (e) { toast(String(e), "error"); }
  };
  useEffect(() => {
    if (!fournisseur) return;
    setCompte(null); setMontant(""); setRendus({}); setCommentaire(""); setOuverte(null); setOnglet("livraisons");
    load();
    invoke<{ id: string; nom: string }[]>("get_emballages").then(setEmballages).catch(() => {});
  }, [fournisseur?.id]);

  const nomEmballage = (id: string) => emballages.find(e => e.id === id)?.nom ?? id;
  const solde = compte?.fournisseur.solde_argent ?? 0;
  const dus = Object.entries(compte?.fournisseur.emballages_dus ?? {}).filter(([, n]) => n !== 0);

  const regler = async () => {
    setSaving(true);
    try {
      await invoke("regler_fournisseur", {
        fournisseurId: fournisseur!.id, montant: parseFloat(montant) || 0,
        emballagesRendus: Object.fromEntries(Object.entries(rendus).map(([k, v]) => [k, parseInt(v) || 0])), commentaire,
      });
      toast("Règlement enregistré", "success");
      setMontant(""); setRendus({}); setCommentaire("");
      await load(); onChange?.();
    } catch (e) { toast(String(e), "error"); }
    setSaving(false);
  };

  const resumeCasiers = (e: Record<string, number>) => Object.entries(e).filter(([, n]) => n !== 0)
    .map(([k, n]) => `${n > 0 ? "+" : "−"}${Math.abs(n)} ${nomEmballage(k)}`).join(", ");

  return (
    <Modal isOpen={!!fournisseur} onClose={onClose} title={fournisseur?.nom ?? ""} size="lg">
      <div className="p-4 sm:p-6 flex flex-col gap-5">
        {!compte ? <Skeleton variant="card" count={3} /> : (
          <>
            {/* Ce qu'on doit */}
            <div className="grid grid-cols-2 gap-3">
              <div className={["rounded-2xl p-4", solde > 0 ? "bg-amber-50" : "bg-slate-50"].join(" ")}>
                <div className="text-xs text-gray-500">On lui doit</div>
                <div className={["chiffre text-[22px] font-extrabold mt-0.5", solde > 0 ? "text-amber-700" : "text-ink-900"].join(" ")}>
                  {formatPrix(Math.max(0, solde))}
                </div>
                {solde < 0 && <div className="text-xs text-emerald-700 mt-0.5">Avance chez lui : {formatPrix(-solde)}</div>}
              </div>
              <div className="rounded-2xl p-4 bg-slate-50">
                <div className="text-xs text-gray-500">Casiers à lui rendre</div>
                {dus.length === 0 ? <div className="chiffre text-[22px] font-extrabold text-ink-900 mt-0.5">0</div> : (
                  <div className="mt-1 flex flex-col gap-0.5">
                    {dus.map(([k, n]) => (
                      <div key={k} className={["text-sm font-semibold", n > 0 ? "text-amber-700" : "text-emerald-700"].join(" ")}>
                        {n > 0 ? casiers(n) : `Il nous doit ${casiers(-n)}`} <span className="text-gray-400 font-normal">· {nomEmballage(k)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {onReception && (
                <Button icon={<PackageCheck size={16} />} onClick={() => onReception(fournisseur!.id)}>Réceptionner une livraison</Button>
              )}
            </div>

            {/* Commandes envoyées, pas encore livrées */}
            {compte.commandes_en_attente.length > 0 && (
              <section className="rounded-2xl border border-secondary-200 bg-secondary-50/50 p-4 flex flex-col gap-3">
                <h3 className="text-[13px] font-bold uppercase tracking-wide text-ink-600 flex items-center gap-2">
                  <ClipboardList size={14} /> Commandes en attente ({compte.commandes_en_attente.length})
                </h3>
                {compte.commandes_en_attente.map(c => (
                  <div key={c.id} className="rounded-xl bg-white border border-slate-200 p-3 flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-800 truncate">{c.numero}</div>
                        <div className="text-xs text-gray-400 truncate">Envoyée le {dateCourte(c.date)} · {c.utilisateur_nom}</div>
                      </div>
                      <span className="text-sm font-bold text-secondary-700 flex-shrink-0">{casiers(c.lignes.reduce((t, l) => t + l.quantite, 0))}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {c.lignes.map(l => (
                        <div key={l.format_id} className="text-xs text-gray-600">{l.quantite} × {l.produit_nom} {volumeFr(l.volume, l.unite, l.casier)}</div>
                      ))}
                    </div>
                    {onReception && (
                      <button onClick={() => onReception(fournisseur!.id, c.id)}
                        className="self-start flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-semibold text-secondary-700 bg-secondary-50 hover:bg-secondary-100">
                        <PackageCheck size={13} /> Livraison reçue
                      </button>
                    )}
                  </div>
                ))}
              </section>
            )}

            {/* Règlement */}
            <section className="rounded-2xl border border-slate-200 p-4 flex flex-col gap-3">
              <h3 className="text-[13px] font-bold uppercase tracking-wide text-ink-600 flex items-center gap-2"><Wallet size={14} /> Payer ou rendre des casiers</h3>
              <div className="flex gap-2">
                <div className="flex-1"><Input type="number" min="0" placeholder="Montant payé" value={montant} onChange={e => setMontant(e.target.value)} /></div>
                {solde > 0 && <Button variant="secondary" onClick={() => setMontant(String(solde))}>Tout</Button>}
              </div>
              {emballages.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {emballages.map(e => (
                    <label key={e.id} className="flex items-center gap-2 text-xs text-gray-600">
                      <span className="flex-1 truncate">{e.nom}</span>
                      <input type="number" inputMode="numeric" min="0" placeholder="0" value={rendus[e.id] ?? ""} onChange={ev => setRendus(r => ({ ...r, [e.id]: ev.target.value }))}
                        className="w-16 h-8 rounded-lg border border-slate-300 px-2 text-sm text-right focus:outline-none focus:border-secondary" />
                    </label>
                  ))}
                </div>
              )}
              <Input placeholder="Commentaire (facultatif)" value={commentaire} onChange={e => setCommentaire(e.target.value)} />
              <Button onClick={regler} loading={saving} disabled={!(parseFloat(montant) > 0) && !Object.values(rendus).some(v => parseInt(v) > 0)}>
                Enregistrer le règlement
              </Button>
            </section>

            {/* Historique */}
            <div className="flex gap-2">
              {(["livraisons", "journal"] as const).map(o => (
                <button key={o} onClick={() => setOnglet(o)}
                  className={["h-9 px-3.5 rounded-full text-[13px] font-semibold", onglet === o ? "bg-ink-900 text-white" : "bg-white border border-slate-200 text-gray-600"].join(" ")}>
                  {o === "livraisons" ? `Livraisons (${compte.receptions.length})` : `Journal (${compte.operations.length})`}
                </button>
              ))}
            </div>

            {onglet === "livraisons" ? (
              compte.receptions.length === 0 ? <p className="text-center text-sm text-gray-400 py-6">Aucune livraison enregistrée</p> : (
                <div className="flex flex-col divide-y divide-slate-100 border border-slate-200 rounded-xl">
                  {compte.receptions.map(r => (
                    <div key={r.id}>
                      <button onClick={() => setOuverte(ouverte === r.id ? null : r.id)} className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-slate-50">
                        {ouverte === r.id ? <ChevronDown size={15} className="text-gray-400" /> : <ChevronRight size={15} className="text-gray-400" />}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-gray-800">{dateCourte(r.date)}{r.numero_bl ? ` · BL ${r.numero_bl}` : ""}</div>
                          <div className="text-xs text-gray-400 truncate">{casiers(r.lignes.reduce((t, l) => t + l.quantite, 0))} · {r.numero} · {r.utilisateur_nom}</div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="chiffre text-sm font-bold text-ink-900">{formatPrix(r.total)}</div>
                          {r.reste_du > 0 && <div className="text-[11px] font-semibold text-amber-700">reste {formatPrix(r.reste_du)}</div>}
                        </div>
                      </button>
                      {ouverte === r.id && (
                        <div className="px-3 pb-3 pl-10 flex flex-col gap-1">
                          {r.lignes.map(l => (
                            <div key={l.format_id} className="flex justify-between text-xs text-gray-600">
                              <span>{l.quantite} × {l.produit_nom} {volumeFr(l.volume, l.unite, l.casier)}{l.prix_achat ? ` à ${formatPrix(l.prix_achat)}` : ""}</span>
                              <span className="chiffre font-semibold">{formatPrix(l.sous_total)}</span>
                            </div>
                          ))}
                          <div className="text-xs text-gray-400 mt-1">
                            Payé {formatPrix(r.montant_paye)}
                            {Object.keys(r.emballages_rendus).length > 0 && ` · vides rendus : ${resumeCasiers(r.emballages_rendus).replace(/\+/g, "")}`}
                            {r.commentaire && ` · ${r.commentaire}`}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            ) : (
              compte.operations.length === 0 ? <p className="text-center text-sm text-gray-400 py-6">Aucune opération</p> : (
                <div className="flex flex-col divide-y divide-slate-100 border border-slate-200 rounded-xl">
                  {compte.operations.map(o => (
                    <div key={o.id} className="flex items-center gap-3 px-3 py-2.5">
                      <span className={["w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", o.type === "réception" ? "bg-slate-100 text-gray-600" : "bg-emerald-50 text-emerald-700"].join(" ")}>
                        {o.type === "réception" ? <Truck size={15} /> : <Wallet size={15} />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-800">{o.type === "réception" ? `Livraison ${o.numero ?? ""}` : "Règlement"}</div>
                        <div className="text-xs text-gray-400 truncate">
                          {dateCourte(o.date)} · {o.utilisateur_nom}{resumeCasiers(o.emballages) && ` · casiers ${resumeCasiers(o.emballages)}`}{o.commentaire ? ` · ${o.commentaire}` : ""}
                        </div>
                      </div>
                      <span className={["chiffre text-sm font-bold flex-shrink-0", o.montant > 0 ? "text-amber-700" : o.montant < 0 ? "text-emerald-700" : "text-gray-400"].join(" ")}>
                        {o.montant > 0 ? "+" : o.montant < 0 ? "−" : ""}{formatPrix(Math.abs(o.montant))}
                      </span>
                    </div>
                  ))}
                </div>
              )
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
