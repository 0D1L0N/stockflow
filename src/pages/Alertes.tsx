import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, ShoppingBag, Check, Send } from "lucide-react";
import ModalBonCommande from "@/components/stock/ModalBonCommande";
import { invoke } from "@/lib/db";
import { useToast } from "@/components/ui/Toast";
import { useAppStore, type FormatAlerte } from "@/stores/appStore";
import Header from "@/components/layout/Header";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import { volumeFr } from "@/lib/format";


export default function Alertes() {
  const { toast } = useToast();
  const loadAlertes = useAppStore((s) => s.loadAlertes);
  const alertes = useAppStore((s) => s.alertes);
  const formatPrix = useAppStore((s) => s.formatMontant);

  const [loading, setLoading] = useState(true);
  // Quantités modifiables par format_id
  const [quantites, setQuantites] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [savingAll, setSavingAll] = useState(false);
  const [bonCommande, setBonCommande] = useState(false);

  const load = async () => {
    setLoading(true);
    await loadAlertes();
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Initialiser les quantités suggérées quand les alertes changent
  useEffect(() => {
    const init: Record<string, string> = {};
    alertes.forEach(a => {
      if (!(a.id in quantites)) {
        init[a.id] = String(a.quantite_manquante || 1);
      }
    });
    if (Object.keys(init).length > 0) {
      setQuantites(prev => ({ ...prev, ...init }));
    }
  }, [alertes]);

  const reapprovisionner = async (a: FormatAlerte) => {
    const qty = parseInt(quantites[a.id] || "1");
    if (!qty || qty <= 0) { toast("Quantité invalide", "warning"); return; }
    setSaving(prev => ({ ...prev, [a.id]: true }));
    try {
      await invoke("reapprovisionner", {
        formatId: a.id,
        quantite: qty,
        commentaire: "Réappro depuis alertes",
      });
      toast(`+${qty} casier${qty > 1 ? "s" : ""} ajouté${qty > 1 ? "s" : ""} pour ${a.produit_nom} ${volumeFr(a.volume, a.unite)}`, "success");
      await loadAlertes();
    } catch (e) { toast(String(e), "error"); }
    setSaving(prev => ({ ...prev, [a.id]: false }));
  };

  const toutCommander = async () => {
    if (alertes.length === 0) return;
    setSavingAll(true);
    let ok = 0;
    for (const a of alertes) {
      const qty = parseInt(quantites[a.id] || "1");
      if (!qty || qty <= 0) continue;
      try {
        await invoke("reapprovisionner", {
          formatId: a.id,
          quantite: qty,
          commentaire: "Commande groupée",
        });
        ok++;
      } catch { /* continuer les autres */ }
    }
    toast(`${ok} produit${ok > 1 ? "s" : ""} réapprovisionné${ok > 1 ? "s" : ""}`, "success");
    await loadAlertes();
    setSavingAll(false);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="Alertes stock"
        subtitle={loading ? "Chargement…" : alertes.length > 0
          ? `${alertes.length} produit${alertes.length > 1 ? "s" : ""} sous le seuil d'alerte`
          : "Tous les stocks sont suffisants"}
        actions={
          <div className="flex gap-2">
            <Button size="sm" icon={<Send size={14} />} onClick={() => setBonCommande(true)}>Bon de commande</Button>
            {alertes.length > 0 && (
              <Button size="sm" variant="secondary" icon={<ShoppingBag size={14} />}
                onClick={toutCommander} loading={savingAll}>
                Tout réceptionner
              </Button>
            )}
            <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={load}>
              Actualiser
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-28 lg:pb-8 [&>*]:w-full [&>*]:max-w-4xl [&>*]:mx-auto flex flex-col gap-3">
        {loading ? (
          <Skeleton variant="card" count={4} />
        ) : alertes.length === 0 ? (
          <Card className="text-center py-16">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
              <Check size={26} className="text-secondary" />
            </div>
            <p className="font-semibold text-gray-700">Aucune alerte !</p>
            <p className="text-gray-400 text-sm mt-1">Tous les stocks sont suffisants.</p>
          </Card>
        ) : (
          <>
            <div className="flex items-center gap-2 px-1">
              <AlertTriangle size={15} className="text-danger" />
              <span className="text-sm font-semibold text-danger">
                {alertes.length} format{alertes.length > 1 ? "s" : ""} sous le seuil — touchez « Réappro » pour ajouter du stock
              </span>
            </div>

            {alertes.map((a) => (
              <Card key={a.id} className="flex flex-col gap-3">
                {/* Infos produit */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-gray-800">{a.produit_nom}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{volumeFr(a.volume, a.unite)} · {formatPrix(a.prix)} le casier</div>
                  </div>
                  <span className="bg-red-50 text-danger text-[10px] font-bold px-2 py-1 rounded-md flex-shrink-0">
                    ALERTE
                  </span>
                </div>

                {/* Métriques */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-red-50 rounded-lg p-2">
                    <div className="text-[10px] text-gray-400 uppercase font-semibold mb-0.5">Stock actuel</div>
                    <div className="text-xl font-extrabold text-danger leading-none">{a.stock}</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-2">
                    <div className="text-[10px] text-gray-400 uppercase font-semibold mb-0.5">Seuil d'alerte</div>
                    <div className="text-xl font-extrabold text-gray-600 leading-none">{a.seuil_alerte}</div>
                  </div>
                  <div className="bg-amber-50 rounded-lg p-2">
                    <div className="text-[10px] text-gray-400 uppercase font-semibold mb-0.5">Manquant</div>
                    <div className="text-xl font-extrabold text-warning leading-none">{a.quantite_manquante}</div>
                  </div>
                </div>

                {/* Commande */}
                <div className="flex items-center gap-2 pt-1 border-t border-slate-200">
                  <div className="flex-1">
                    <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">
                      Quantité à commander
                    </label>
                    <input
                      type="number" min="1"
                      value={quantites[a.id] ?? String(a.quantite_manquante || 1)}
                      onChange={e => setQuantites(prev => ({ ...prev, [a.id]: e.target.value }))}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold focus:outline-none focus:border-secondary"
                    />
                  </div>
                  <div className="flex-shrink-0 mt-5">
                    <Button
                      size="sm"
                      loading={saving[a.id]}
                      onClick={() => reapprovisionner(a)}
                    >
                      Réappro
                    </Button>
                  </div>
                </div>

                {/* Suggestion */}
                <div className="text-xs text-gray-400">
                  Suggestion : commander{" "}
                  <span className="font-semibold text-gray-600">{a.quantite_manquante}</span> casiers
                  → nouveau stock :{" "}
                  <span className="font-semibold text-secondary">
                    {a.stock + (parseInt(quantites[a.id] || String(a.quantite_manquante)) || 0)}
                  </span>
                </div>
              </Card>
            ))}
          </>
        )}
      </div>
      <ModalBonCommande isOpen={bonCommande} onClose={() => setBonCommande(false)} />
    </div>
  );
}
