import { useEffect, useState } from "react";
import { Package2, Plus, Trash2, Check } from "lucide-react";
import { invoke } from "@/lib/db";
import { useToast } from "@/components/ui/Toast";
import Card from "@/components/ui/Card";

interface TypeEmballage { id: string; nom: string; }

/** Liste des types de casiers consignés (Paramètres, gérant). */
export default function GestionEmballages() {
  const { toast } = useToast();
  const [liste, setListe] = useState<TypeEmballage[]>([]);
  const [noms, setNoms] = useState<Record<string, string>>({});
  const [nouveau, setNouveau] = useState("");

  const load = async () => {
    try {
      const l = await invoke<TypeEmballage[]>("get_emballages");
      setListe(l);
      setNoms(Object.fromEntries(l.map(e => [e.id, e.nom])));
    } catch (e) { toast(String(e), "error"); }
  };
  useEffect(() => { load(); }, []);

  const renommer = async (e: TypeEmballage) => {
    try { await invoke("update_emballage", { id: e.id, nom: noms[e.id] }); toast("Emballage renommé", "success"); await load(); }
    catch (err) { toast(String(err), "error"); }
  };
  const supprimer = async (e: TypeEmballage) => {
    if (!confirm(`Supprimer « ${e.nom} » ?`)) return;
    try { await invoke("delete_emballage", { id: e.id }); toast("Emballage supprimé", "success"); await load(); }
    catch (err) { toast(String(err), "error"); }
  };
  const ajouter = async () => {
    if (!nouveau.trim()) return;
    try { await invoke("create_emballage", { nom: nouveau }); setNouveau(""); toast("Emballage ajouté", "success"); await load(); }
    catch (err) { toast(String(err), "error"); }
  };

  const champ = "flex-1 min-w-0 rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:border-secondary";

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Package2 size={16} className="text-primary" />
        <h3 className="font-semibold text-gray-700 text-sm">Types d'emballages consignés</h3>
      </div>
      <p className="text-xs text-gray-500 -mt-1">
        Casiers que les clients doivent rendre. Chaque format de produit est rattaché à l'un d'eux.
      </p>
      {liste.map(e => (
        <div key={e.id} className="flex items-center gap-2">
          <input value={noms[e.id] ?? ""} onChange={ev => setNoms(n => ({ ...n, [e.id]: ev.target.value }))} className={champ} />
          {noms[e.id] !== e.nom && (
            <button onClick={() => renommer(e)} title="Enregistrer"
              className="p-2 rounded-lg bg-secondary text-white hover:bg-secondary-600"><Check size={14} /></button>
          )}
          <button onClick={() => supprimer(e)} title="Supprimer"
            className="p-2 rounded-lg text-gray-400 hover:bg-red-50 hover:text-danger"><Trash2 size={14} /></button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <input value={nouveau} onChange={e => setNouveau(e.target.value)} placeholder="ex. : Casier Coca 24 × 0,33 L"
          onKeyDown={e => { if (e.key === "Enter") ajouter(); }} className={champ} />
        <button onClick={ajouter} disabled={!nouveau.trim()} title="Ajouter"
          className="p-2 rounded-lg bg-primary text-white disabled:opacity-40"><Plus size={14} /></button>
      </div>
    </Card>
  );
}
