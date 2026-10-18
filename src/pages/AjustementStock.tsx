import { useEffect, useState } from "react";
import { invoke } from "@/lib/db";
import { useToast } from "@/components/ui/Toast";
import { useAppStore } from "@/stores/appStore";
import Header from "@/components/layout/Header";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import { SlidersHorizontal, ClipboardList } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import EtatVide from "@/components/ui/EtatVide";
import { volumeFr } from "@/lib/format";
import { useTempsReel } from "@/lib/tempsReel";

interface Produit { id: string; nom: string; }
interface Format { id: string; volume: number; unite: string; prix: number; stock: number; }
interface ProduitAvecFormats { produit: Produit; formats: Format[]; }
interface Mouvement {
  id: string; produit_nom: string | null; volume: number | null; unite: string | null;
  type: string; quantite: number; stock_avant: number; stock_apres: number;
  commentaire: string | null; date: string | null;
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

type Mode = "absolu" | "diff";

export default function AjustementStock() {
  const { toast } = useToast();
  const loadAlertes = useAppStore((s) => s.loadAlertes);

  const [produits, setProduits] = useState<Produit[]>([]);
  const [selectedProduit, setSelectedProduit] = useState<ProduitAvecFormats | null>(null);
  const [selectedFormatId, setSelectedFormatId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("absolu");
  const [valeur, setValeur] = useState("");
  const [raison, setRaison] = useState("");
  const [saving, setSaving] = useState(false);
  const [historique, setHistorique] = useState<Mouvement[]>([]);
  const [loadingHist, setLoadingHist] = useState(true);

  useEffect(() => {
    invoke<Produit[]>("get_produits").then(setProduits);
    loadHistorique();
  }, []);

  const loadHistorique = async () => {
    setLoadingHist(true);
    const h = await invoke<Mouvement[]>("get_mouvements_stock", {
      formatId: null, dateDebut: null, dateFin: null, typeMouvement: "ajustement",
    });
    setHistorique(h.slice(0, 10));
    setLoadingHist(false);
  };

  const handleSelectProduit = async (id: string) => {
    setSelectedFormatId(null);
    setValeur("");
    if (!id) { setSelectedProduit(null); return; }
    const data = await invoke<ProduitAvecFormats>("get_produit", { id });
    setSelectedProduit(data);
    if (data.formats.length > 0) setSelectedFormatId(data.formats[0].id);
  };

  // Stock du produit affiché mis à jour si quelqu'un vend ou réapprovisionne entre-temps
  useTempsReel(["stock"], () => {
    loadHistorique();
    if (selectedProduit) invoke<ProduitAvecFormats>("get_produit", { id: selectedProduit.produit.id }).then(setSelectedProduit).catch(() => {});
  });

  const selectedFormat = selectedProduit?.formats.find(f => f.id === selectedFormatId) ?? null;

  const nouveauStock = (): number | null => {
    if (!selectedFormat || valeur === "") return null;
    const v = parseInt(valeur);
    if (isNaN(v)) return null;
    return mode === "absolu" ? v : selectedFormat.stock + v;
  };

  const nsPreview = nouveauStock();

  const handleSubmit = async () => {
    if (!selectedFormat) { toast("Sélectionnez un format", "warning"); return; }
    if (raison.trim().length < 5) { toast("La raison est obligatoire (min. 5 caractères)", "warning"); return; }
    const ns = nouveauStock();
    if (ns === null || ns < 0) { toast("Valeur invalide", "warning"); return; }

    setSaving(true);
    try {
      await invoke("ajuster_stock", {
        formatId: selectedFormat.id,
        nouveauStock: ns,
        commentaire: raison.trim(),
      });
      const diff = ns - selectedFormat.stock;
      toast(
        `Stock ajusté : ${selectedFormat.stock} → ${ns} (${diff >= 0 ? "+" : ""}${diff})`,
        "success"
      );
      setValeur("");
      setRaison("");
      await Promise.all([loadHistorique(), loadAlertes()]);
      // Rafraîchir le format sélectionné
      if (selectedProduit) await handleSelectProduit(selectedProduit.produit.id);
    } catch (e) { toast(String(e), "error"); }
    setSaving(false);
  };

  const raisonError = raison.length > 0 && raison.trim().length < 5
    ? "Minimum 5 caractères" : undefined;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Ajustement de stock" subtitle="Inventaire, casse, correction manuelle" icone={<SlidersHorizontal size={22} />}
        chiffres={loadingHist ? undefined : [
          { label: "Ajustements récents", valeur: historique.length },
          { label: "Produits", valeur: produits.length },
        ]} />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-28 lg:pb-8 [&>*]:w-full [&>*]:max-w-4xl [&>*]:mx-auto flex flex-col gap-4">
        {/* Formulaire */}
        <Card className="flex flex-col gap-4">
          <div className="flex items-center gap-2 mb-1">
            <SlidersHorizontal size={16} className="text-primary" />
            <span className="font-semibold text-gray-700">Sélection du produit</span>
          </div>

          {/* Sélection produit */}
          <div>
            <label className="text-[13px] font-medium text-gray-700 block mb-1.5">
              Produit
            </label>
            <select
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:border-secondary bg-white"
              value={selectedProduit?.produit.id ?? ""}
              onChange={e => handleSelectProduit(e.target.value)}
            >
              <option value="">— Sélectionner un produit —</option>
              {produits.map(p => (
                <option key={p.id} value={p.id}>{p.nom}</option>
              ))}
            </select>
          </div>

          {/* Sélection format */}
          {selectedProduit && selectedProduit.formats.length > 0 && (
            <div>
              <label className="text-[13px] font-medium text-gray-700 block mb-1.5">
                Format
              </label>
              <select
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:border-secondary bg-white"
                value={selectedFormatId ?? ""}
                onChange={e => setSelectedFormatId(e.target.value)}
              >
                {selectedProduit.formats.map(f => (
                  <option key={f.id} value={f.id}>{volumeFr(f.volume, f.unite)}</option>
                ))}
              </select>
            </div>
          )}

          {/* Stock actuel */}
          {selectedFormat && (
            <div className="bg-slate-50 rounded-xl p-4 text-center">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                Stock actuel
              </div>
              <div className="text-5xl font-extrabold text-primary leading-none">
                {selectedFormat.stock}
              </div>
              <div className="text-sm text-gray-400 mt-1">casiers en stock</div>
            </div>
          )}

          {/* Mode ajustement */}
          {selectedFormat && (
            <>
              <div>
                <label className="text-[13px] font-medium text-gray-700 block mb-2">
                  Type d'ajustement
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(["absolu", "diff"] as Mode[]).map(m => (
                    <button key={m} onClick={() => { setMode(m); setValeur(""); }}
                      className={["rounded-lg border-2 px-3 py-2.5 text-sm font-medium transition-all",
                        mode === m
                          ? "border-secondary bg-green-50 text-secondary"
                          : "border-slate-200 text-gray-500 hover:border-gray-300"].join(" ")}>
                      {m === "absolu" ? "Nouveau stock" : "Ajuster par différence"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[13px] font-medium text-gray-700 block mb-1.5">
                  {mode === "absolu" ? "Nouveau stock (valeur absolue)" : "Différence (+/-)"}
                </label>
                <input
                  type="number"
                  placeholder={mode === "absolu" ? "ex. : 50" : "ex. : +10 ou -5"}
                  value={valeur}
                  onChange={e => setValeur(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:border-secondary"
                />
              </div>

              {/* Preview */}
              {nsPreview !== null && (
                <div className={["rounded-lg px-4 py-3 flex items-center justify-between text-sm",
                  nsPreview < 0 ? "bg-red-50" : "bg-green-50"].join(" ")}>
                  <span className="text-gray-600 font-medium">Aperçu</span>
                  <span className="font-extrabold">
                    <span className="text-gray-700">{selectedFormat.stock}</span>
                    <span className="text-gray-400 mx-2">→</span>
                    <span className={nsPreview < 0 ? "text-danger" : "text-secondary"}>
                      {nsPreview < 0 ? "Invalide" : nsPreview}
                    </span>
                  </span>
                </div>
              )}

              {/* Raison */}
              <div>
                <label className="text-[13px] font-medium text-gray-700 block mb-1.5">
                  Raison <span className="text-danger">*</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="ex. : Inventaire physique, casse, vol…"
                  value={raison}
                  onChange={e => setRaison(e.target.value)}
                  className={["w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none resize-none",
                    raisonError ? "border-danger focus:border-danger" : "border-gray-300 focus:border-secondary"].join(" ")}
                />
                {raisonError && <p className="text-xs text-danger mt-1">{raisonError}</p>}
                {!raisonError && raison.length > 0 && (
                  <p className="text-xs text-gray-400 mt-1">{raison.trim().length}/5 min.</p>
                )}
              </div>

              <Button onClick={handleSubmit} loading={saving}
                disabled={nsPreview === null || nsPreview < 0 || raison.trim().length < 5}>
                Valider l'ajustement
              </Button>
            </>
          )}
        </Card>

        {/* Historique des 10 derniers ajustements */}
        <div>
          <h2 className="text-[15px] font-bold text-ink-900 mb-3 px-1">10 derniers ajustements</h2>
          {loadingHist ? (
            <Skeleton variant="table-row" count={5} />
          ) : historique.length === 0 ? (
            <EtatVide icone={<ClipboardList size={26} />} titre="Aucun ajustement" texte="Les corrections d'inventaire apparaîtront ici." />
          ) : (
            <Card padding="none">
              {/* En-tête */}
              <div className="hidden sm:grid grid-cols-5 gap-3 px-4 py-2.5 bg-slate-50 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-slate-200">
                <span className="col-span-2">Produit</span>
                <span>Avant</span>
                <span>Après</span>
                <span>Date</span>
              </div>
              {historique.map(m => (
                <div key={m.id} className="grid grid-cols-1 sm:grid-cols-5 gap-1 sm:gap-3 px-4 py-3 border-b border-gray-50 last:border-0 text-sm">
                  <div className="sm:col-span-2 flex items-center gap-3">
                    <Avatar nom={m.produit_nom ?? "?"} taille="sm" />
                    <div className="min-w-0">
                      <div className="font-semibold text-ink-900 truncate">{m.produit_nom} {volumeFr(m.volume, m.unite)}</div>
                      {m.commentaire && <div className="text-xs text-gray-400 italic truncate">{m.commentaire}</div>}
                    </div>
                  </div>
                  <div className="text-gray-600">{m.stock_avant}</div>
                  <div className={m.stock_apres > m.stock_avant ? "text-secondary font-semibold" : "text-danger font-semibold"}>
                    {m.stock_apres}
                    <span className="text-xs text-gray-400 font-normal ml-1">
                      ({m.stock_apres - m.stock_avant >= 0 ? "+" : ""}{m.stock_apres - m.stock_avant})
                    </span>
                  </div>
                  <div className="text-xs text-gray-400">{formatDate(m.date)}</div>
                </div>
              ))}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
