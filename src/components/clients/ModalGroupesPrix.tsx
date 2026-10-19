import { useEffect, useState } from "react";
import { Plus, Layers, Tag, Edit2, Trash2, Check, X, Users, Search } from "lucide-react";
import { invoke } from "@/lib/db";
import { useToast } from "@/components/ui/Toast";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import EtatVide from "@/components/ui/EtatVide";
import Avatar from "@/components/ui/Avatar";
import ModalPrixClient from "./ModalPrixClient";

interface ClientGroupe { id: string; nom: string; telephone?: string | null; est_defaut?: number; groupe_prix_id?: string | null; }

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
  // Choix des clients d'un groupe
  const [membres, setMembres] = useState<{ id: string; nom: string } | null>(null);
  const [clients, setClients] = useState<ClientGroupe[]>([]);
  const [recherche, setRecherche] = useState("");
  const [enCours, setEnCours] = useState<string | null>(null);

  const ouvrirMembres = async (g: { id: string; nom: string }) => {
    setMembres(g); setRecherche("");
    try { setClients((await invoke<ClientGroupe[]>("get_clients")).filter(c => c.est_defaut !== 1)); }
    catch (e) { toast(String(e), "error"); }
  };

  /** Coche : le client entre dans le groupe (et quitte l'ancien) ; décoche : il n'a plus de groupe. */
  const basculer = async (c: ClientGroupe) => {
    if (!membres) return;
    const dedans = c.groupe_prix_id === membres.id;
    const ancien = !dedans && c.groupe_prix_id ? groupes.find(g => g.id === c.groupe_prix_id)?.nom : null;
    setEnCours(c.id);
    try {
      await invoke("set_groupe_client", { clientId: c.id, groupeId: dedans ? null : membres.id });
      setClients(cs => cs.map(x => x.id === c.id ? { ...x, groupe_prix_id: dedans ? null : membres.id } : x));
      toast(dedans ? `${c.nom} retiré du groupe` : ancien ? `${c.nom} passe de « ${ancien} » à « ${membres.nom} »` : `${c.nom} ajouté au groupe`, "success");
      onChange?.();
    } catch (e) { toast(String(e), "error"); }
    setEnCours(null);
  };

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
      <Modal isOpen={isOpen && !grille && !membres} onClose={onClose} title="Groupes de prix" size="lg">
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
                <div key={g.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3">
                  <Avatar nom={g.nom} taille="md" />
                  <div className="flex-1 min-w-[150px]">
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
                    <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
                      <button onClick={() => ouvrirMembres({ id: g.id, nom: g.nom })}
                        className="flex items-center gap-1.5 px-2.5 h-9 rounded-lg text-xs font-semibold text-secondary-700 bg-secondary-50 hover:bg-secondary-100">
                        <Users size={13} /> Clients
                      </button>
                      <button onClick={() => setGrille({ id: g.id, nom: g.nom })}
                        className="flex items-center gap-1.5 px-2.5 h-9 rounded-lg text-xs font-semibold text-gray-700 bg-slate-100 hover:bg-slate-200">
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

      {/* Clients du groupe : cocher pour ajouter, décocher pour retirer */}
      <Modal isOpen={!!membres} onClose={() => { setMembres(null); load(); }} title={membres ? `Clients du groupe « ${membres.nom} »` : ""} size="lg">
        <div className="p-4 sm:p-6 flex flex-col gap-3">
          <p className="text-xs text-gray-500">
            Cochez les clients qui ont les prix de ce groupe. Leurs prix propres (dans leur fiche) restent prioritaires.
          </p>
          <Input placeholder="Chercher un client…" value={recherche} onChange={e => setRecherche(e.target.value)} icon={<Search size={16} />} />
          <div className="text-xs font-semibold text-gray-500">
            {clients.filter(c => c.groupe_prix_id === membres?.id).length} client(s) dans le groupe
          </div>
          <div className="flex flex-col divide-y divide-slate-100 border border-slate-200 rounded-xl">
            {clients
              .filter(c => c.nom.toLowerCase().includes(recherche.toLowerCase()))
              // Membres d'abord, puis les autres par nom
              .sort((a, b) => Number(b.groupe_prix_id === membres?.id) - Number(a.groupe_prix_id === membres?.id) || a.nom.localeCompare(b.nom, "fr"))
              .map(c => {
                const dedans = c.groupe_prix_id === membres?.id;
                const autre = !dedans && c.groupe_prix_id ? groupes.find(g => g.id === c.groupe_prix_id)?.nom : null;
                return (
                  <label key={c.id} className="flex items-center gap-3 px-3 min-h-[52px] cursor-pointer hover:bg-slate-50">
                    <input type="checkbox" checked={dedans} disabled={enCours === c.id} onChange={() => basculer(c)}
                      className="w-5 h-5 accent-secondary flex-shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-gray-800 truncate">{c.nom}</span>
                      {autre && <span className="block text-xs text-amber-700">Dans « {autre} » : cocher le fera changer de groupe</span>}
                    </span>
                  </label>
                );
              })}
            {clients.length === 0 && <p className="text-center text-sm text-gray-400 py-6">Aucun client enregistré</p>}
          </div>
          <Button onClick={() => { setMembres(null); load(); }} className="w-full justify-center">Terminé</Button>
        </div>
      </Modal>
    </>
  );
}
