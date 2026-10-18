import { useEffect, useState } from "react";
import { Plus, Edit2, Mail, KeyRound, UserX, UserCheck } from "lucide-react";
import { invoke } from "@/lib/db";
import { useToast } from "@/components/ui/Toast";
import { useAuthStore } from "@/stores/authStore";
import { ROLE_LABELS, ROLES_PROPOSES, type Role } from "@/lib/roles";
import Header from "@/components/layout/Header";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import Card from "@/components/ui/Card";

interface Utilisateur { id: string; nom: string; email: string; role: Role; actif: boolean; }

const DESCRIPTIONS: Record<Role, string> = {
  gerant: "Tous les droits : prix, rapports, paramètres, comptes",
  vendeur: "Ventes, clients, ses propres ventes, et gestion du stock (réappro, ajustements, alertes, mouvements)",
  magasinier: "Réappro, ajustements, alertes et mouvements de stock",
};

const ROLE_BADGE: Record<Role, "info" | "success" | "warning"> = {
  gerant: "info", vendeur: "success", magasinier: "warning",
};

const selectCls = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-secondary/40 focus:border-secondary";

export default function Utilisateurs() {
  const { toast } = useToast();
  const monUid = useAuthStore((s) => s.profil?.uid);
  const [liste, setListe] = useState<Utilisateur[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState<Utilisateur | null>(null);
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [role, setRole] = useState<Role>("vendeur");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setListe(await invoke<Utilisateur[]>("get_utilisateurs")); }
    catch (e) { toast(String(e), "error"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEdit(null); setNom(""); setEmail(""); setMotDePasse(""); setRole("vendeur"); setModal(true);
  };
  const openEdit = (u: Utilisateur) => {
    setEdit(u); setNom(u.nom); setEmail(u.email); setMotDePasse(""); setRole(u.role); setModal(true);
  };

  const save = async () => {
    if (!nom.trim()) { toast("Le nom est obligatoire", "warning"); return; }
    if (!edit && motDePasse.length < 6) { toast("Mot de passe : 6 caractères minimum", "warning"); return; }
    setSaving(true);
    try {
      if (edit) await invoke("update_utilisateur", { uid: edit.id, nom, role, actif: edit.actif });
      else await invoke("create_utilisateur", { nom, email, motDePasse, role });
      toast(edit ? "Compte mis à jour" : `Compte créé pour ${nom.trim()}`, "success");
      setModal(false);
      await load();
    } catch (e) { toast(String(e), "error"); }
    setSaving(false);
  };

  const basculerActif = async (u: Utilisateur) => {
    if (u.actif && !confirm(`Désactiver le compte de ${u.nom} ? Il ne pourra plus se connecter.`)) return;
    try {
      await invoke("update_utilisateur", { uid: u.id, nom: u.nom, role: u.role, actif: !u.actif });
      toast(`${u.actif ? "Compte désactivé" : "Compte réactivé"} : ${u.nom}`, "success");
      await load();
    } catch (e) { toast(String(e), "error"); }
  };

  const envoyerReinitialisation = async (u: Utilisateur) => {
    try {
      await invoke("reinitialiser_mot_de_passe", { email: u.email });
      toast(`Lien de réinitialisation envoyé à ${u.email}`, "success");
    } catch (e) { toast(String(e), "error"); }
  };

  const actifs = liste.filter(u => u.actif).length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Utilisateurs" subtitle={`${actifs} compte${actifs > 1 ? "s" : ""} actif${actifs > 1 ? "s" : ""}`}
        actions={<Button icon={<Plus size={16} />} onClick={openNew}>Nouvel utilisateur</Button>} />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-28 lg:pb-8 [&>*]:w-full [&>*]:max-w-4xl [&>*]:mx-auto flex flex-col gap-2">
        {loading ? (
          <Skeleton variant="card" count={3} />
        ) : liste.map(u => {
          const soiMeme = u.id === monUid;
          return (
            <Card key={u.id} className={["flex items-center gap-3", u.actif ? "" : "opacity-60"].join(" ")}>
              <div className={["w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
                u.actif ? "bg-primary" : "bg-gray-300"].join(" ")}>
                <span className="text-white font-bold text-sm">{u.nom.charAt(0).toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-800 text-sm truncate">{u.nom}</span>
                  <Badge variant={ROLE_BADGE[u.role]}>{ROLE_LABELS[u.role]}</Badge>
                  {!u.actif && <Badge variant="danger">Désactivé</Badge>}
                  {soiMeme && <Badge>Vous</Badge>}
                </div>
                <span className="flex items-center gap-1 text-xs text-gray-500 mt-1 truncate">
                  <Mail size={11} />{u.email}
                </span>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => envoyerReinitialisation(u)} title="Envoyer un lien de nouveau mot de passe"
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-primary transition-colors">
                  <KeyRound size={15} />
                </button>
                <button onClick={() => openEdit(u)} title="Modifier le nom ou le rôle"
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-primary transition-colors">
                  <Edit2 size={15} />
                </button>
                {!soiMeme && (
                  <button onClick={() => basculerActif(u)} title={u.actif ? "Désactiver" : "Réactiver"}
                    className={["p-1.5 rounded-lg transition-colors text-gray-400",
                      u.actif ? "hover:bg-red-50 hover:text-danger" : "hover:bg-green-50 hover:text-secondary"].join(" ")}>
                    {u.actif ? <UserX size={15} /> : <UserCheck size={15} />}
                  </button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <Modal isOpen={modal} onClose={() => setModal(false)} title={edit ? "Modifier l'utilisateur" : "Nouvel utilisateur"}>
        <div className="p-6 flex flex-col gap-4">
          <Input label="Nom" value={nom} onChange={e => setNom(e.target.value)} placeholder="ex. : Koffi Mensah" />
          <Input label="E-mail" type="email" value={email} onChange={e => setEmail(e.target.value)}
            disabled={!!edit} placeholder="ex. : koffi@exemple.com" autoComplete="off" />
          {!edit && (
            <Input label="Mot de passe provisoire" type="text" value={motDePasse} onChange={e => setMotDePasse(e.target.value)}
              placeholder="6 caractères minimum" autoComplete="new-password" />
          )}
          <div>
            <label className="text-[13px] font-medium text-gray-700 block mb-1.5">Rôle</label>
            <select value={role} onChange={e => setRole(e.target.value as Role)} className={selectCls}
              disabled={edit?.id === monUid}>
              {/* Un compte magasinier existant garde son rôle affiché tant qu'on ne le change pas */}
              {[...ROLES_PROPOSES, ...(edit?.role && !ROLES_PROPOSES.includes(edit.role) ? [edit.role] : [])]
                .map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
            <p className="text-xs text-gray-500 mt-1.5">{DESCRIPTIONS[role]}</p>
          </div>
          {!edit && (
            <p className="text-xs text-gray-500 bg-slate-50 rounded-lg px-3 py-2">
              Communiquez l'e-mail et le mot de passe provisoire à l'employé. Il pourra le changer avec
              « Mot de passe oublié » sur l'écran de connexion.
            </p>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setModal(false)}>Annuler</Button>
            <Button onClick={save} loading={saving}>{edit ? "Mettre à jour" : "Créer le compte"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
