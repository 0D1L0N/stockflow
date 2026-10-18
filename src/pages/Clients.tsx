import { useEffect, useState } from "react";
import { Plus, Search, Edit2, Trash2, Phone, MapPin, Shield, Tag, ChevronRight } from "lucide-react";
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

interface Client {
  id: string; nom: string; telephone: string | null;
  adresse: string | null; est_defaut: number; date_creation: string | null;
  solde_argent?: number; emballages_dus?: Record<string, number>;
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
  const [saving, setSaving] = useState(false);
  const [prixClient, setPrixClient] = useState<Client | null>(null);
  const [compte, setCompte] = useState<Client | null>(null);
  const estGerant = useAuthStore((s) => s.profil?.role === "gerant");
  const [seulementDebiteurs, setSeulementDebiteurs] = useState(false);
  const [nomsEmballages, setNomsEmballages] = useState<Record<string, string>>({});
  const nomEmballage = (id: string) => nomsEmballages[id] ?? "Casier";

  const load = async () => {
    setLoading(true);
    setClients(await invoke<Client[]>("get_clients"));
    setLoading(false);
  };
  useEffect(() => {
    load();
    invoke<{ id: string; nom: string }[]>("get_emballages")
      .then(l => setNomsEmballages(Object.fromEntries(l.map(e => [e.id, e.nom])))).catch(() => {});
  }, []);

  const doitQuelqueChose = (c: Client) =>
    (c.solde_argent ?? 0) > 0 || Object.values(c.emballages_dus ?? {}).some(n => n > 0);

  const filtered = clients.filter(c =>
    (c.nom.toLowerCase().includes(search.toLowerCase()) || (c.telephone ?? "").includes(search))
    && (!seulementDebiteurs || doitQuelqueChose(c))
  );
  const nbDebiteurs = clients.filter(doitQuelqueChose).length;

  const openNew = () => { setEdit(null); setNom(""); setTelephone(""); setAdresse(""); setModal(true); };
  const openEdit = (c: Client) => { setEdit(c); setNom(c.nom); setTelephone(c.telephone ?? ""); setAdresse(c.adresse ?? ""); setModal(true); };

  const save = async () => {
    if (!nom.trim()) return;
    setSaving(true);
    try {
      if (edit) await invoke("update_client", { id: edit.id, nom: nom.trim(), telephone: telephone || null, adresse: adresse || null });
      else await invoke("create_client", { nom: nom.trim(), telephone: telephone || null, adresse: adresse || null });
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

  const initials = (nom: string) => nom.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Clients" subtitle={`${clients.length} client${clients.length > 1 ? "s" : ""}`}
        actions={<Button icon={<Plus size={16} />} onClick={openNew}>Nouveau client</Button>} />

      <div className="flex-1 overflow-y-auto p-4 pb-28 lg:pb-6 flex flex-col gap-3">
        <Input placeholder="Rechercher par nom ou téléphone…" value={search}
          onChange={e => setSearch(e.target.value)} icon={<Search size={16} />} />

        <div className="flex gap-2">
          <button onClick={() => setSeulementDebiteurs(false)}
            className={["px-3 py-1.5 rounded-full text-xs font-semibold transition-colors",
              !seulementDebiteurs ? "bg-primary text-white" : "bg-white text-gray-600 border border-gray-200"].join(" ")}>
            Tous
          </button>
          <button onClick={() => setSeulementDebiteurs(true)}
            className={["px-3 py-1.5 rounded-full text-xs font-semibold transition-colors",
              seulementDebiteurs ? "bg-orange-600 text-white" : "bg-white text-gray-600 border border-gray-200"].join(" ")}>
            Doivent quelque chose ({nbDebiteurs})
          </button>
        </div>

        {loading ? (
          <Skeleton variant="card" count={4} />
        ) : filtered.length === 0 ? (
          <Card className="text-center py-12">
            <p className="text-gray-400 text-sm">{search ? `Aucun résultat pour "${search}"` : "Aucun client. Créez-en un !"}</p>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map(c => {
              const defaut = c.est_defaut === 1;
              // Un bouton dans la carte ne doit pas aussi ouvrir le compte
              const action = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };
              return (
                <Card key={c.id} padding="sm" onClick={defaut ? undefined : () => setCompte(c)} className="sm:p-4">
                  <div className="flex items-center gap-3">
                    <div className={["w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0",
                      doitQuelqueChose(c) ? "bg-orange-100 text-orange-700" : "bg-primary-50 text-primary-700"].join(" ")}>
                      {defaut ? <Shield size={18} /> : <span className="font-bold text-sm">{initials(c.nom)}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900 text-[15px] truncate">{c.nom}</span>
                        {defaut && <Badge variant="info">Comptoir</Badge>}
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
          <Input label="Téléphone" value={telephone} onChange={e => setTelephone(e.target.value)} placeholder="+229 97 00 00 00" />
          <Input label="Adresse" value={adresse} onChange={e => setAdresse(e.target.value)} placeholder="ex. : Cotonou Centre" />
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setModal(false)}>Annuler</Button>
            <Button onClick={save} loading={saving}>{edit ? "Mettre à jour" : "Créer"}</Button>
          </div>
        </div>
      </Modal>

      <ModalPrixClient client={prixClient} onClose={() => setPrixClient(null)} />
      <ModalCompteClient client={compte} nomEmballage={nomEmballage} onClose={() => setCompte(null)}
        onChange={() => { invoke<Client[]>("get_clients").then(setClients).catch(() => {}); }} />
    </div>
  );
}
