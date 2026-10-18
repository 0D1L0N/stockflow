import { useEffect, useState } from "react";
import { Plus, Truck, Phone, MapPin, Edit2, Trash2, PackageCheck, Wallet, ChevronRight, ClipboardList } from "lucide-react";
import { invoke } from "@/lib/db";
import { useToast } from "@/components/ui/Toast";
import { useAppStore } from "@/stores/appStore";
import { useAuthStore } from "@/stores/authStore";
import Header from "@/components/layout/Header";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Card from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";
import EtatVide from "@/components/ui/EtatVide";
import Avatar from "@/components/ui/Avatar";
import ModalReception from "@/components/fournisseurs/ModalReception";
import ModalCompteFournisseur from "@/components/fournisseurs/ModalCompteFournisseur";
import { casiers } from "@/lib/format";

interface Fournisseur {
  id: string; nom: string; telephone: string | null; adresse: string | null;
  solde_argent?: number; emballages_dus?: Record<string, number>;
}
interface ReceptionResume { id: string; numero: string; fournisseur_nom: string; date: string; total: number; reste_du: number; lignes: { quantite: number }[]; }
interface CommandeAttente { id: string; numero: string; fournisseur_id: string; fournisseur_nom: string; date: string; lignes: { quantite: number }[]; }
type Reception = { ouvert: boolean; fournisseurId: string | null; commandeId?: string | null };

const dateCourte = (d: string) => new Date(d.replace(" ", "T")).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function Fournisseurs() {
  const { toast } = useToast();
  const formatPrix = useAppStore((s) => s.formatMontant);
  const estGerant = useAuthStore((s) => s.profil?.role === "gerant");
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [receptions, setReceptions] = useState<ReceptionResume[]>([]);
  const [commandes, setCommandes] = useState<CommandeAttente[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState<Fournisseur | null>(null);
  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [adresse, setAdresse] = useState("");
  const [saving, setSaving] = useState(false);
  const [reception, setReception] = useState<Reception>({ ouvert: false, fournisseurId: null });
  const [compte, setCompte] = useState<Fournisseur | null>(null);
  const [version, setVersion] = useState(0);

  const load = async (silencieux = false) => {
    if (!silencieux) setLoading(true);
    try {
      const [f, r, c] = await Promise.all([
        invoke<Fournisseur[]>("get_fournisseurs"),
        invoke<ReceptionResume[]>("get_receptions", {}),
        invoke<CommandeAttente[]>("get_commandes_fournisseur", { statut: "envoyée" }).catch(() => [] as CommandeAttente[]),
      ]);
      setFournisseurs(f); setReceptions(r); setCommandes(c);
    } catch (e) { toast(String(e), "error"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const totalDu = fournisseurs.reduce((t, f) => t + Math.max(0, f.solde_argent ?? 0), 0);
  const casiersDus = fournisseurs.reduce((t, f) => t + Object.values(f.emballages_dus ?? {}).reduce((s, n) => s + Math.max(0, n), 0), 0);
  const ilYa30j = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const livraisons30j = receptions.filter(r => r.date >= ilYa30j).length;

  const openNew = () => { setEdit(null); setNom(""); setTelephone(""); setAdresse(""); setModal(true); };
  const openEdit = (f: Fournisseur) => { setEdit(f); setNom(f.nom); setTelephone(f.telephone ?? ""); setAdresse(f.adresse ?? ""); setModal(true); };

  const save = async () => {
    if (!nom.trim()) return;
    setSaving(true);
    try {
      const args = { nom: nom.trim(), telephone: telephone || null, adresse: adresse || null };
      if (edit) await invoke("update_fournisseur", { id: edit.id, ...args });
      else await invoke("create_fournisseur", args);
      toast(edit ? "Fournisseur mis à jour" : "Fournisseur ajouté", "success");
      setModal(false);
      await load(true);
    } catch (e) { toast(String(e), "error"); }
    setSaving(false);
  };

  const supprimer = async (f: Fournisseur) => {
    if (!confirm(`Supprimer « ${f.nom} » ? Ses livraisons restent dans l'historique.`)) return;
    try { await invoke("delete_fournisseur", { id: f.id }); toast("Fournisseur supprimé", "success"); await load(true); }
    catch (e) { toast(String(e), "error"); }
  };

  const action = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Fournisseurs" subtitle="Livraisons reçues, ce qu'on leur doit, casiers échangés" icone={<Truck size={22} />}
        actions={<>
          <Button variant="secondary" icon={<Plus size={16} />} onClick={openNew}>Nouveau fournisseur</Button>
          <Button icon={<PackageCheck size={16} />} onClick={() => setReception({ ouvert: true, fournisseurId: null })}>Réceptionner</Button>
        </>}
        chiffres={loading ? undefined : [
          { label: "Fournisseurs", valeur: fournisseurs.length },
          { label: "On leur doit", valeur: formatPrix(totalDu), ton: totalDu > 0 ? "alerte" : "neutre" },
          { label: "Casiers à rendre", valeur: casiersDus, ton: casiersDus > 0 ? "alerte" : "neutre" },
          { label: "Livraisons (30 j)", valeur: livraisons30j },
        ]} />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-28 lg:pb-8 [&>*]:w-full [&>*]:max-w-4xl [&>*]:mx-auto [&>*]:flex-shrink-0 flex flex-col gap-3">
        {!loading && commandes.length > 0 && (
          <section className="mb-2">
            <h2 className="text-[15px] font-bold text-ink-900 mb-3 px-1 flex items-center gap-2">
              <ClipboardList size={16} className="text-secondary-700" /> Commandes en attente de livraison
            </h2>
            <Card padding="none" className="overflow-hidden divide-y divide-slate-100">
              {commandes.map(c => (
                <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar nom={c.fournisseur_nom} taille="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-800 truncate">{c.fournisseur_nom}</div>
                    <div className="text-xs text-gray-400 truncate">{c.numero} · {dateCourte(c.date)} · {casiers(c.lignes.reduce((t, l) => t + l.quantite, 0))}</div>
                  </div>
                  <button onClick={() => setReception({ ouvert: true, fournisseurId: c.fournisseur_id, commandeId: c.id })}
                    className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-semibold text-secondary-700 bg-secondary-50 hover:bg-secondary-100 flex-shrink-0">
                    <PackageCheck size={13} /> Reçue
                  </button>
                </div>
              ))}
            </Card>
          </section>
        )}

        {loading ?<Skeleton variant="card" count={3} /> : fournisseurs.length === 0 ? (
          <EtatVide icone={<Truck size={26} />} titre="Aucun fournisseur"
            texte="Ajoutez vos 2 ou 3 fournisseurs, puis enregistrez chaque livraison reçue : le stock se met à jour tout seul."
            action={<Button icon={<Plus size={16} />} onClick={openNew}>Nouveau fournisseur</Button>} />
        ) : (
          <div className="flex flex-col gap-2">
            {fournisseurs.map(f => {
              const solde = f.solde_argent ?? 0;
              const dus = Object.values(f.emballages_dus ?? {}).reduce((t, n) => t + Math.max(0, n), 0);
              const enAttente = commandes.filter(c => c.fournisseur_id === f.id).length;
              return (
                <Card key={f.id} padding="sm" onClick={() => setCompte(f)} className="sm:p-4">
                  <div className="flex items-center gap-3">
                    <Avatar nom={f.nom} taille="lg" />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 text-[15px] truncate">{f.nom}</div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                        {f.telephone && <span className="flex items-center gap-1 text-xs text-gray-500"><Phone size={11} />{f.telephone}</span>}
                        {f.adresse && <span className="flex items-center gap-1 text-xs text-gray-500 truncate"><MapPin size={11} />{f.adresse}</span>}
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-gray-300 flex-shrink-0" />
                  </div>
                  {(solde > 0 || dus > 0 || enAttente > 0) && (
                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                      {solde > 0 && <span className="px-2 py-1 rounded-lg bg-amber-50 text-amber-800 flex items-center gap-1"><Wallet size={12} />On lui doit {formatPrix(solde)}</span>}
                      {dus > 0 && <span className="px-2 py-1 rounded-lg bg-amber-50 text-amber-800">{casiers(dus)} à lui rendre</span>}
                      {enAttente > 0 && <span className="px-2 py-1 rounded-lg bg-secondary-50 text-secondary-800 flex items-center gap-1"><ClipboardList size={12} />{enAttente} commande{enAttente > 1 ? "s" : ""} en attente</span>}
                    </div>
                  )}
                  <div className="flex items-center gap-1 mt-3 pt-2.5 border-t border-slate-100">
                    <button onClick={action(() => setReception({ ouvert: true, fournisseurId: f.id }))}
                      className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-semibold text-secondary-700 hover:bg-secondary-50">
                      <PackageCheck size={13} /> Livraison reçue
                    </button>
                    {estGerant && <button onClick={action(() => openEdit(f))}
                      className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-semibold text-gray-600 hover:bg-slate-100">
                      <Edit2 size={13} /> Modifier
                    </button>}
                    {estGerant && (
                      <button onClick={action(() => supprimer(f))} aria-label={`Supprimer ${f.nom}`}
                        className="ml-auto flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:bg-red-50 hover:text-danger">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {receptions.length > 0 && (
          <section className="mt-3">
            <h2 className="text-[15px] font-bold text-ink-900 mb-3 px-1">Dernières livraisons</h2>
            <Card padding="none" className="overflow-hidden divide-y divide-slate-100">
              {receptions.slice(0, 15).map(r => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar nom={r.fournisseur_nom} taille="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-800 truncate">{r.fournisseur_nom}</div>
                    <div className="text-xs text-gray-400">{dateCourte(r.date)} · {casiers(r.lignes.reduce((t, l) => t + l.quantite, 0))}</div>
                  </div>
                  <div className="text-right">
                    <div className="chiffre text-sm font-bold text-ink-900">{formatPrix(r.total)}</div>
                    {r.reste_du > 0 && <div className="text-[11px] font-semibold text-amber-700">reste {formatPrix(r.reste_du)}</div>}
                  </div>
                </div>
              ))}
            </Card>
          </section>
        )}
      </div>

      <Modal isOpen={modal} onClose={() => setModal(false)} title={edit ? "Modifier le fournisseur" : "Nouveau fournisseur"}>
        <div className="p-6 flex flex-col gap-4">
          <Input label="Nom" value={nom} onChange={e => setNom(e.target.value)} placeholder="ex. : SOBEBRA Cotonou" />
          <Input label="Téléphone / WhatsApp" value={telephone} onChange={e => setTelephone(e.target.value)} placeholder="+229 97 00 00 00" />
          <Input label="Adresse" value={adresse} onChange={e => setAdresse(e.target.value)} placeholder="ex. : Zone industrielle" />
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setModal(false)}>Annuler</Button>
            <Button onClick={save} loading={saving}>{edit ? "Mettre à jour" : "Ajouter"}</Button>
          </div>
        </div>
      </Modal>

      <ModalReception isOpen={reception.ouvert} fournisseurId={reception.fournisseurId} commandeId={reception.commandeId}
        onClose={() => setReception({ ouvert: false, fournisseurId: null })} onDone={() => { setVersion(v => v + 1); load(true); }} />
      <ModalCompteFournisseur key={version} fournisseur={reception.ouvert ? null : compte} onClose={() => setCompte(null)} onChange={() => load(true)}
        onReception={(id, commandeId) => setReception({ ouvert: true, fournisseurId: id, commandeId })} />
    </div>
  );
}
