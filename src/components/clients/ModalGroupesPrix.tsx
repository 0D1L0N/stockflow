import { useEffect, useState } from "react";
import { Plus, Layers, Tag, Edit2, Trash2, Check, X } from "lucide-react";
import { invoke } from "@/lib/db";
import { useToast } from "@/components/ui/Toast";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import EtatVide from "@/components/ui/EtatVide";
import Avatar from "@/components/ui/Avatar";
import ModalPrixClient from "./ModalPrixClient";

export interface GroupePrixResume { id: string; nom: string; nb_clients: number; nb_prix: number; }

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Appelé après toute modification (les fiches clients affichent leur groupe) */
  onChange?: () => void;
}

/** Liste des groupes de prix : création, renommage, suppression, grille de prix. */
export default function ModalGroupesPrix({ isOpen, onClose, onChange }: Props) {
  const { toast } = useToast();
  const [groupes, setGroupes] = useState<GroupePrixResume[]>([]);
  const [loading, setLoading] = useState(true);
  const [nouveau, setNouveau] = useState("");
  const [creating, setCreating] = useState(false);
  const [renomme, setRenomme] = useState<{ id: string; nom: string } | null>(null);
  const [grille, setGrille] = useState<{ id: string; nom: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try { setGroupes(await invoke<GroupePrixResume[]>("get_groupes_prix")); }
    catch (e) { toast(String(e), "error"); }
    setLoading(false);
  };
  useEffect(() => { if (isOpen) { setNouveau(""); setRenomme(null); load(); } }, [isOpen]);

  const creer = async () => {
    if (!nouveau.trim()) return;
    setCreating(true);
    try {
      const id = await invoke<string>("create_groupe_prix", { nom: nouveau.trim() });
      toast("Groupe créé : renseignez maintenant sa grille de prix", "success");
      setGrille({ id, nom: nouveau.trim() });
      setNouveau("");
      await load(); onChange?.();
    } catch (e) { toast(String(e), "error"); }
    setCreating(false);
  };

  const renommer = async () => {
    if (!renomme?.nom.trim()) return;
    try {
      await invoke("update_groupe_prix", { id: renomme.id, nom: renomme.nom.trim() });
      setRenomme(null);
      await load(); onChange?.();
    } catch (e) { toast(String(e), "error"); }
  };

  const supprimer = async (g: GroupePrixResume) => {
    const suite = g.nb_clients > 0 ? ` Ses ${g.nb_clients} client${g.nb_clients > 1 ? "s" : ""} passeront au prix comptoir (sauf leurs prix propres).` : "";
    if (!confirm(`Supprimer le groupe « ${g.nom} » ?${suite}`)) return;
    try {
      await invoke("delete_groupe_prix", { id: g.id });
      toast("Groupe supprimé", "success");
      await load(); onChange?.();
    } catch (e) { toast(String(e), "error"); }
  };

  return (
    <>
      <Modal isOpen={isOpen && !grille} onClose={onClose} title="Groupes de prix" size="lg">
        <div className="p-4 sm:p-6 flex flex-col gap-4">
          <p className="text-xs text-gray-500">
            Un groupe réunit les clients qui ont les mêmes prix. Un client du groupe en hérite automatiquement ;
            ses prix hors du commun se mettent un à un dans sa fiche.
          </p>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Input placeholder="Nom du nouveau groupe (ex. : Bars quartier)" value={nouveau}
                onChange={e => setNouveau(e.target.value)} onKeyDown={e => { if (e.key === "Enter") creer(); }} />
            </div>
            <Button icon={<Plus size={16} />} onClick={creer} loading={creating} disabled={!nouveau.trim()}>Créer</Button>
          </div>

          {loading ? (
            <Skeleton variant="card" count={2} />
          ) : groupes.length === 0 ? (
            <EtatVide icone={<Layers size={26} />} titre="Aucun groupe"
              texte="Créez un groupe ici, ou ouvrez les prix d'un client et touchez « En faire un groupe »." />
          ) : (
            <div className="flex flex-col divide-y divide-slate-100 border border-slate-200 rounded-xl">
              {groupes.map(g => (
                <div key={g.id} className="flex items-center gap-3 px-3 py-3">
                  <Avatar nom={g.nom} taille="md" />
                  <div className="flex-1 min-w-0">
                    {renomme?.id === g.id ? (
                      <div className="flex items-center gap-1">
                        <input autoFocus value={renomme.nom} onChange={e => setRenomme({ ...renomme, nom: e.target.value })}
                          onKeyDown={e => { if (e.key === "Enter") renommer(); if (e.key === "Escape") setRenomme(null); }}
                          className="flex-1 min-w-0 rounded-lg border border-secondary-600 px-2 py-1 text-sm font-semibold focus:outline-none" />
                        <button onClick={renommer} title="Enregistrer" className="p-1.5 rounded-lg bg-secondary text-white"><Check size={14} /></button>
                        <button onClick={() => setRenomme(null)} title="Annuler" className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><X size={14} /></button>
                      </div>
                    ) : (
                      <>
                        <div className="text-sm font-semibold text-gray-900 truncate">{g.nom}</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {g.nb_clients} client{g.nb_clients > 1 ? "s" : ""} · {g.nb_prix} prix
                        </div>
                      </>
                    )}
                  </div>
                  {renomme?.id !== g.id && (
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button onClick={() => setGrille({ id: g.id, nom: g.nom })}
                        className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-semibold text-gray-700 bg-slate-100 hover:bg-slate-200">
                        <Tag size={13} /> Prix
                      </button>
                      <button onClick={() => setRenomme({ id: g.id, nom: g.nom })} aria-label={`Renommer ${g.nom}`}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-slate-100 hover:text-gray-700">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => supprimer(g)} aria-label={`Supprimer ${g.nom}`}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-danger">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      <ModalPrixClient groupe={grille} onClose={() => { setGrille(null); load(); }} />
    </>
  );
}
