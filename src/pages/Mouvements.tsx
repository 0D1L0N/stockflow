import { useEffect, useState } from "react";
import { invoke } from "@/lib/db";
import Header from "@/components/layout/Header";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import Button from "@/components/ui/Button";
import { Filter, TrendingUp, ArrowLeftRight } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import EtatVide from "@/components/ui/EtatVide";
import Pastilles from "@/components/ui/Pastilles";
import { volumeFr } from "@/lib/format";

interface Mouvement {
  id: string; format_id: string; produit_nom: string | null;
  volume: number | null; unite: string | null;
  type: string; quantite: number; stock_avant: number; stock_apres: number;
  source: string; commentaire: string | null; date: string | null;
}

const typeVariant: Record<string, "success" | "danger" | "warning"> = {
  "entrée": "success", "sortie": "danger", "ajustement": "warning",
};

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function Mouvements() {
  const [mouvements, setMouvements] = useState<Mouvement[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFiltre, setTypeFiltre] = useState<"tous" | "entrée" | "sortie" | "ajustement">("tous");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      const data = await invoke<Mouvement[]>("get_mouvements_stock", {
        formatId: null, dateDebut: dateDebut || null,
        dateFin: dateFin || null, typeMouvement: null,
      });
      setMouvements(data);
    } catch (e) {
      console.error("get_mouvements_stock:", e);
      setMouvements([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const somme = (type: string) => mouvements.filter(m => m.type === type).reduce((t, m) => t + m.quantite, 0);
  const affiches = mouvements.filter(m => typeFiltre === "tous" || m.type === typeFiltre);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Mouvements de stock" subtitle="Toutes les entrées, sorties et corrections" icone={<TrendingUp size={22} />}
        chiffres={loading ? undefined : [
          { label: "Casiers entrés", valeur: `+${somme("entrée")}`, ton: "succes" },
          { label: "Casiers sortis", valeur: `−${somme("sortie")}`, ton: "danger" },
          { label: "Ajustements", valeur: mouvements.filter(m => m.type === "ajustement").length },
        ]} />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-28 lg:pb-8 [&>*]:w-full [&>*]:max-w-4xl [&>*]:mx-auto flex flex-col gap-3">
        <Card className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-28">
            <label className="text-[13px] font-medium text-gray-700 block mb-1.5">Du</label>
            <input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:border-secondary" />
          </div>
          <div className="flex-1 min-w-28">
            <label className="text-[13px] font-medium text-gray-700 block mb-1.5">Au</label>
            <input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:border-secondary" />
          </div>
          <Button size="sm" icon={<Filter size={14} />} onClick={load}>Filtrer</Button>
        </Card>

        <Pastilles valeur={typeFiltre} onChange={setTypeFiltre} options={[
          { valeur: "tous", label: "Tous", compte: mouvements.length },
          { valeur: "entrée", label: "Entrées", compte: mouvements.filter(m => m.type === "entrée").length },
          { valeur: "sortie", label: "Sorties", compte: mouvements.filter(m => m.type === "sortie").length },
          { valeur: "ajustement", label: "Ajustements", compte: mouvements.filter(m => m.type === "ajustement").length },
        ]} />

        {loading ? <Skeleton variant="table-row" count={8} /> : affiches.length === 0 ? (
          <EtatVide icone={<ArrowLeftRight size={26} />} titre="Aucun mouvement" texte="Aucune entrée ni sortie de stock sur cette période." />
        ) : (
          <Card padding="none" className="overflow-hidden divide-y divide-slate-100">
            {affiches.map(m => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3.5">
                <Avatar nom={m.produit_nom ?? "?"} taille="md" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">
                    {m.produit_nom} {volumeFr(m.volume, m.unite)}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Badge variant={typeVariant[m.type] ?? "default"}>{m.type}</Badge>
                    <span className="text-xs text-gray-400 truncate">{m.source} · {formatDate(m.date)}</span>
                  </div>
                  {m.commentaire && <div className="text-xs text-gray-400 italic">{m.commentaire}</div>}
                </div>
                <div className="text-right flex-shrink-0">
                  <div className={["chiffre text-[17px] font-extrabold", m.type === "sortie" ? "text-red-600" : m.type === "entrée" ? "text-emerald-600" : "text-ink-900"].join(" ")}>
                    {m.type === "sortie" ? "−" : m.type === "entrée" ? "+" : ""}{m.type === "ajustement" ? `${m.stock_apres - m.stock_avant >= 0 ? "+" : "−"}${Math.abs(m.stock_apres - m.stock_avant)}` : m.quantite}
                  </div>
                  <div className="text-xs text-gray-400">{m.stock_avant} → {m.stock_apres}</div>
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
