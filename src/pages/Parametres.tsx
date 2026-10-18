import { useEffect, useState } from "react";
import { invoke } from "@/lib/db";
import { useToast } from "@/components/ui/Toast";
import { useAppStore } from "@/stores/appStore";
import Header from "@/components/layout/Header";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import { Save } from "lucide-react";
import GestionEmballages from "@/components/emballages/GestionEmballages";
import CarteSauvegarde from "@/components/sauvegarde/CarteSauvegarde";

interface Parametres {
  id: number; nom_commerce: string; adresse_commerce: string | null;
  telephone_commerce: string | null; email_commerce: string | null;
  devise: string; symbole_devise: string; symbole_position: string;
  notifications_son: number; mode_sombre: number; langue: string;
  derniere_sauvegarde?: string | null;
}

export default function Parametres() {
  const { toast } = useToast();
  const setDevise = useAppStore((s) => s.setDevise);
  const [params, setParams] = useState<Parametres | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    invoke<Parametres>("get_parametres").then(p => { setParams(p); setLoading(false); });
  }, []);

  const save = async () => {
    if (!params) return;
    setSaving(true);
    try {
      await invoke("update_parametres", {
        nomCommerce: params.nom_commerce,
        adresseCommerce: params.adresse_commerce,
        telephoneCommerce: params.telephone_commerce,
        emailCommerce: params.email_commerce,
        devise: params.devise,
        symboleDevise: params.symbole_devise,
        symbolePosition: params.symbole_position,
        notificationsSon: params.notifications_son,
        modeSombre: params.mode_sombre,
        langue: params.langue,
      });
      setDevise(params.devise, params.symbole_devise, params.symbole_position as "before" | "after");
      toast("Paramètres enregistrés", "success");
    } catch (e) { toast(String(e), "error"); }
    setSaving(false);
  };

  const set = (key: keyof Parametres, val: string | number) =>
    setParams(p => p ? { ...p, [key]: val } : p);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Paramètres" subtitle="Configuration de l'application"
        actions={<Button icon={<Save size={15} />} onClick={save} loading={saving}>Enregistrer</Button>} />

      <div className="flex-1 overflow-y-auto p-4 pb-28 lg:pb-6 flex flex-col gap-4 max-w-2xl">
        {loading ? <Skeleton variant="card" count={3} /> : params && (
          <>
            <Card className="flex flex-col gap-4">
              <h3 className="font-semibold text-gray-700 text-sm">Informations du commerce</h3>
              <Input label="Nom du commerce" value={params.nom_commerce}
                onChange={e => set("nom_commerce", e.target.value)} />
              <Input label="Adresse" value={params.adresse_commerce ?? ""}
                onChange={e => set("adresse_commerce", e.target.value)} />
              <Input label="Téléphone" value={params.telephone_commerce ?? ""}
                onChange={e => set("telephone_commerce", e.target.value)} />
              <Input label="E-mail" type="email" value={params.email_commerce ?? ""}
                onChange={e => set("email_commerce", e.target.value)} />
            </Card>

            <Card className="flex flex-col gap-4">
              <h3 className="font-semibold text-gray-700 text-sm">Devise</h3>
              <div className="flex gap-3">
                <div className="flex-1">
                  <Input label="Code devise" value={params.devise}
                    onChange={e => set("devise", e.target.value)} placeholder="XOF" />
                </div>
                <div className="flex-1">
                  <Input label="Symbole" value={params.symbole_devise}
                    onChange={e => set("symbole_devise", e.target.value)} placeholder="FCFA" />
                </div>
              </div>
            </Card>

            <Card className="flex flex-col gap-3">
              <h3 className="font-semibold text-gray-700 text-sm">Préférences</h3>
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-gray-700">Notifications sonores</span>
                <button onClick={() => set("notifications_son", params.notifications_son === 1 ? 0 : 1)}
                  className={["relative w-10 h-5 rounded-full transition-colors", params.notifications_son ? "bg-secondary" : "bg-gray-300"].join(" ")}>
                  <div className={["absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", params.notifications_son ? "left-5" : "left-0.5"].join(" ")} />
                </button>
              </label>
            </Card>

            <Button icon={<Save size={15} />} onClick={save} loading={saving} className="w-full justify-center">
              Enregistrer les paramètres
            </Button>

            {/* Enregistrés à part : chaque modification est immédiate */}
            <GestionEmballages />

            <CarteSauvegarde derniere={params.derniere_sauvegarde ?? null}
              onFaite={date => setParams(p => p && { ...p, derniere_sauvegarde: date })} />
          </>
        )}
      </div>
    </div>
  );
}
