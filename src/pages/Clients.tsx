import { sansAccent } from "@/lib/format";
import { useEffect, useState } from "react";
import { Plus, Search, Edit2, Trash2, Phone, MapPin, Shield, Tag, ChevronRight, Users, Layers } from "lucide-react";
import ModalGroupesPrix, { type GroupePrixResume } from "@/components/clients/ModalGroupesPrix";
import { useAppStore } from "@/stores/appStore";
import Pastilles from "@/components/ui/Pastilles";
import EtatVide from "@/components/ui/EtatVide";
import { useAuthStore } from "@/stores/authStore";
import { invoke } from "@/lib/db";
import { useToast } from "@/components/ui/Toast";
import Header from "@/components/layout/Header";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import Card from "@/components/ui/Card";
import ModalPrixClient from "@/components/clients/ModalPrixClient";
import ModalCompteClient from "@/components/clients/ModalCompteClient";
import SoldesBandeau from "@/components/clients/SoldesBandeau";
import Avatar from "@/components/ui/Avatar";
import { useTempsReel } from "@/lib/tempsReel";

interface Client {
  id: string; nom: string; telephone: string | null;
  adresse: string | null; est_defaut: number; date_creation: string | null;
  solde_argent?: number; emballages_dus?: Record<string, number>;
  groupe_prix_id?: string | null;
}

export default function Clients() {
  const { toast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState<Client | null>(null);
  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [adresse, setAdresse] = useState("");
  const [groupePrixId, setGroupePrixId] = useState("");
  const [groupes, setGroupes] = useState<GroupePrixResume[]>([]);
  const [showGroupes, setShowGroupes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [prixClient, setPrixClient] = useState<Client | null>(null);
  const [compte, setCompte] = useState<Client | null>(null);
  const estGerant = useAuthStore((s) => s.profil?.role === "gerant");
  const [seulementDebiteurs, setSeulementDebiteurs] = useState(false);
  const [nomsEmballages, setNomsEmballages] = useState<Record<string, string>>({});
  const nomEmballage = (id: string) => nomsEmballages[id] ?? "Casier";

  const load = async (silencieux = false) => {
    if (!silencieux) setLoading(true);
    const [liste, gps] = await Promise.all([
      invoke<Client[]>("get_clients"),
      invoke<GroupePrixResume[]>("get_groupes_prix").catch(() => [] as GroupePrixResume[]),
    ]);
    setClients(liste); setGroupes(gps);
    setLoading(false);
  };
  const nomGroupe = (id?: string | null) => groupes.find(g => g.id === id)?.nom ?? null;
  useEffect(() => {
    load();
    invoke<{ id: string; nom: string }[]>("get_emballages")
      .then(l => setNomsEmballages(Object.fromEntries(l.map(e => [e.id, e.nom])))).catch(() => {});
  }, []);

  // Soldes modifiés depuis un autre appareil (vente, paiement, retour de casiers)
  useTempsReel(["clients"], () => { load(true); });

  const doitQuelqueChose = (c: Client) =>
    (c.solde_argent ?? 0) > 0 || Object.values(c.emballages_dus ?? {}).some(n => n > 0);

  // Téléphone : on compare les chiffres seuls (« 9700 » trouve « 01 97 00 00 00 »)
  const chiffresRecherche = search.replace(/\D/g, "");
  const filtered = clients.filter(c =>
    (sansAccent(c.nom).includes(sansAccent(search))
      || (chiffresRecherche.length > 0 && (c.telephone ?? "").replace(/\D/g, "").includes(chiffresRecherche)))
    && (!seulementDebiteurs || doitQuelqueChose(c))
  );
  const nbDebiteurs = clients.filter(doitQuelqueChose).length;
  const totalDettes = clients.reduce((s, c) => s + Math.max(0, c.solde_argent ?? 0), 0);
  const totalCasiers = clients.reduce((s, c) => s + Object.values(c.emballages_dus ?? {}).reduce((t, n) => t + Math.max(0, n), 0), 0);
  const formatPrix = useAppStore((st) => st.formatMontant);

  const openNew = () => { setEdit(null); setNom(""); setTelephone(""); setAdresse(""); setGroupePrixId(""); setModal(true); };
  const openEdit = (c: Client) => { setEdit(c); setNom(c.nom); setTelephone(c.telephone ?? ""); setAdresse(c.adresse ?? ""); setGroupePrixId(c.groupe_prix_id ?? ""); setModal(true); };

  const save = async () => {
    if (!nom.trim()) return;
    setSaving(true);
    try {
      const groupe = estGerant ? (groupePrixId || null) : undefined;
      if (edit) await invoke("update_client", { id: edit.id, nom: nom.trim(), telephone: telephone || null, adresse: adresse || null, groupePrixId: groupe });
      else await invoke("create_client", { nom: nom.trim(), telephone: telephone || null, adresse: adresse || null, groupePrixId: groupe });
      // Nouveau groupe pour un client existant : ses anciens prix propres masqueraient ceux du groupe
      if (edit && groupe && groupe !== (edit.groupe_prix_id ?? null)
          && confirm(`Effacer les prix propres de ${nom.trim()} pour qu'il suive entièrement le groupe « ${nomGroupe(groupe)} » ?
(Annuler : il garde ses prix et n'hérite que des prix qui lui manquent.)`)) {
        await invoke("vider_prix_client", { clientId: edit.id });
      }
      toast(edit ? "Client mis à jour" : "Client créé", "success");
      setModal(false);
      await load();
    } catch (e) { toast(String(e), "error"); }
    setSaving(false);
  };

  const deleteClient = async (c: Client) => {
    if (!confirm(`Supprimer "${c.nom}" ?`)) return;
    try {
      await invoke("delete_client", { id: c.id });
      toast("Client supprimé", "success");
      await load();
    } catch (e) { toast(String(e), "error"); }
  };


  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Clients" subtitle="Comptes, dettes et casiers à rendre" icone={<Users size={22} />}
        actions={<>
          {estGerant && <Button variant="secondary" icon={<Layers size={16} />} onClick={() => setShowGroupes(true)}>Groupes de prix</Button>}
          <Button icon={<Plus size={16} />} onClick={openNew}>Nouveau client</Button>
        </>}
        chiffres={loading ? undefined : [
          { label: "Clients", valeur: clients.filter(c => c.est_defaut !== 1).length },
          { label: "Argent dû", valeur: formatPrix(totalDettes), ton: totalDettes > 0 ? "alerte" : "neutre" },
          { label: "Casiers dehors", valeur: totalCasiers, ton: totalCasiers > 0 ? "alerte" : "neutre" },
          { label: "Clients à crédit", valeur: nbDebiteurs },
        ]} />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-28 lg:pb-8 [&>*]:w-full [&>*]:max-w-4xl [&>*]:mx-auto [&>*]:flex-shrink-0 flex flex-col gap-3">
        <Input placeholder="Rechercher par nom ou téléphone…" value={search}
          onChange={e => setSearch(e.target.value)} icon={<Search size={16} />} />

        <Pastilles valeur={seulementDebiteurs ? "debiteurs" : "tous"} onChange={v => setSeulementDebiteurs(v === "debiteurs")}
          options={[
            { valeur: "tous", label: "Tous", compte: clients.length },
            { valeur: "debiteurs", label: "Doivent quelque chose", compte: nbDebiteurs },
          ]} />

        {loading ? (
          <Skeleton variant="card" count={4} />
        ) : filtered.length === 0 ? (
          <EtatVide icone={<Users size={26} />}
            titre={search ? `Aucun résultat pour « ${search} »` : seulementDebiteurs ? "Personne ne doit rien" : "Aucun client"}
            texte={search ? "Vérifiez l'orthographe ou cherchez par téléphone." : seulementDebiteurs ? "Tous les comptes clients sont à jour." : "Ajoutez vos clients réguliers pour suivre leurs prix et leurs dettes."}
            action={!search && !seulementDebiteurs ? <Button icon={<Plus size={16} />} onClick={openNew}>Nouveau client</Button> : undefined} />
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map(c => {
              const defaut = c.est_defaut === 1;
              // Un bouton dans la carte ne doit pas aussi ouvrir le compte
              const action = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };
              return (
                <Card key={c.id} padding="sm" onClick={defaut ? undefined : () => setCompte(c)} className="sm:p-4">
                  <div className="flex items-center gap-3">
                    {defaut ? (
                      <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 bg-slate-100 text-gray-500"><Shield size={18} /></div>
                    ) : <Avatar nom={c.nom} taille="lg" rond />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900 text-[15px] truncate">{c.nom}</span>
                        {defaut && <Badge variant="info">Comptoir</Badge>}
                        {nomGroupe(c.groupe_prix_id) && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-ink-900/5 text-ink-700 text-[11px] font-semibold flex-shrink-0">
                            <Layers size={11} />{nomGroupe(c.groupe_prix_id)}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                        {c.telephone && (
                          <span className="flex items-center gap-1 text-xs text-gray-500"><Phone size={11} />{c.telephone}</span>
                        )}
                        {c.adresse && (
                          <span className="flex items-center gap-1 text-xs text-gray-500 truncate"><MapPin size={11} />{c.adresse}</span>
                        )}
                        {defaut && <span className="text-xs text-gray-500">Ventes payées comptant</span>}
                      </div>
                    </div>
                    {!defaut && <ChevronRight size={18} className="text-gray-300 flex-shrink-0" />}
                  </div>

                  <SoldesBandeau client={c} nomEmballage={nomEmballage} className="mt-3" />

                  {!defaut && estGerant && (
                    <div className="flex items-center gap-1 mt-3 pt-2.5 border-t border-slate-100">
                      <button onClick={action(() => setPrixClient(c))}
                        className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-semibold text-gray-600 hover:bg-slate-100 transition-colors">
                        <Tag size={13} /> Prix
                      </button>
                      <button onClick={action(() => openEdit(c))}
                        className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-semibold text-gray-600 hover:bg-slate-100 transition-colors">
                        <Edit2 size={13} /> Modifier
                      </button>
                      <button onClick={action(() => deleteClient(c))} aria-label={`Supprimer ${c.nom}`}
                        className="ml-auto flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:bg-red-50 hover:text-danger transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Modal isOpen={modal} onClose={() => setModal(false)} title={edit ? "Modifier le client" : "Nouveau client"}>
        <div className="p-6 flex flex-col gap-4">
          <Input label="Nom" value={nom} onChange={e => setNom(e.target.value)} placeholder="ex. : Bar Le Central" />
          <Input label="Téléphone" type="tel" value={telephone} onChange={e => setTelephone(e.target.value)} placeholder="01 97 00 00 00" />
          <Input label="Adresse" value={adresse} onChange={e => setAdresse(e.target.value)} placeholder="ex. : Cotonou Centre" />
          {estGerant && (
            <div>
              <label className="text-[13px] font-medium text-gray-700 block mb-1.5">Groupe de prix</label>
              <select value={groupePrixId} onChange={e => setGroupePrixId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-secondary">
                <option value="">Aucun (prix un à un)</option>
                {groupes.map(g => <option key={g.id} value={g.id}>{g.nom}</option>)}
              </select>
              <p className="text-xs text-gray-400 mt-1">Le client hérite des prix du groupe ; ses prix hors du commun se règlent dans « Prix ».</p>
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setModal(false)}>Annuler</Button>
            <Button onClick={save} loading={saving}>{edit ? "Mettre à jour" : "Créer"}</Button>
          </div>
        </div>
      </Modal>

      <ModalPrixClient client={prixClient} onClose={() => setPrixClient(null)} onChange={() => load(true)} />
      <ModalGroupesPrix isOpen={showGroupes} onClose={() => setShowGroupes(false)} onChange={() => load(true)} />
      <ModalCompteClient client={compte} nomEmballage={nomEmballage} onClose={() => setCompte(null)}
        onChange={() => { invoke<Client[]>("get_clients").then(setClients).catch(() => {}); }} />
    </div>
  );
}
