import { useEffect, useState } from "react";
import { AlertTriangle, Plus, RefreshCw, History, Send } from "lucide-react";
import ModalBonCommande from "@/components/stock/ModalBonCommande";
import { invoke } from "@/lib/db";
import { useToast } from "@/components/ui/Toast";
import { useAppStore } from "@/stores/appStore";
import Header from "@/components/layout/Header";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Skeleton from "@/components/ui/Skeleton";
import Badge from "@/components/ui/Badge";
import { volumeFr } from "@/lib/format";
import { useTempsReel } from "@/lib/tempsReel";

interface FormatAlerte {
  id: string; produit_id: string; produit_nom: string;
  volume: number; unite: string; prix: number;
  stock: number; seuil_alerte: number; en_alerte: number; quantite_manquante: number;
}

interface Mouvement {
  id: string; produit_nom: string | null; volume: number | null; unite: string | null;
  type: string; quantite: number; stock_avant: number; stock_apres: number;
  source: string; commentaire: string | null; date: string | null;
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function Reappro() {
  const { toast } = useToast();
  const loadAlertes = useAppStore((s) => s.loadAlertes);
  const [alertes, setAlertes] = useState<FormatAlerte[]>([]);
  const [historique, setHistorique] = useState<Mouvement[]>([]);
  const [loading, setLoading] = useState(true);
  const [bonCommande, setBonCommande] = useState(false);

  // Modal réapprovisionnement
  const [modal, setModal] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<FormatAlerte | null>(null);
  const [quantite, setQuantite] = useState("1");
  const [commentaire, setCommentaire] = useState("");
  const [saving, setSaving] = useState(false);

  // Modal ajustement
  const [modalAjust, setModalAjust] = useState(false);
  const [nouvStock, setNouvStock] = useState("");

  const load = async (silencieux = false) => {
    try {
      if (!silencieux) setLoading(true);
      const [a, h] = await Promise.all([
        invoke<FormatAlerte[]>("get_formats_en_alerte"),
        invoke<Mouvement[]>("get_mouvements_stock", {
          formatId: null, dateDebut: null, dateFin: null, typeMouvement: "entrée",
        }),
      ]);
      setAlertes(a);
      // Exclure les entrées générées par des annulations de vente
      setHistorique(h.filter(m => m.source === "réapprovisionnement").slice(0, 10));
    } catch (e) {
      console.error("Reappro load:", e);
      setAlertes([]);
      setHistorique([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useTempsReel(["stock"], () => { load(true); });

  const openReappro = (f: FormatAlerte) => {
    setSelectedFormat(f);
    setQuantite(String(f.quantite_manquante || 1));
    setCommentaire("");
    setModal(true);
  };

  const openAjust = (f: FormatAlerte) => {
    setSelectedFormat(f);
    setNouvStock(String(f.stock));
    setCommentaire("");
    setModalAjust(true);
  };

  const saveReappro = async () => {
    if (!selectedFormat) return;
    const qty = parseInt(quantite);
    if (!qty || qty <= 0) { toast("Quantité invalide", "warning"); return; }
    setSaving(true);
    try {
      await invoke("reapprovisionner", {
        formatId: selectedFormat.id,
        quantite: qty,
        commentaire: commentaire || null,
      });
      toast(`+${qty} casier${qty > 1 ? "s" : ""} ajouté${qty > 1 ? "s" : ""} — ${selectedFormat.produit_nom} ${volumeFr(selectedFormat.volume, selectedFormat.unite)}`, "success");
      setModal(false);
      await Promise.all([load(), loadAlertes()]);
    } catch (e) { toast(String(e), "error"); }
    setSaving(false);
  };

  const saveAjust = async () => {
    if (!selectedFormat) return;
    const ns = parseInt(nouvStock);
    if (isNaN(ns) || ns < 0) { toast("Valeur invalide", "warning"); return; }
    setSaving(true);
    try {
      await invoke("ajuster_stock", {
        formatId: selectedFormat.id,
        nouveauStock: ns,
        commentaire: commentaire || null,
      });
      toast("Stock ajusté avec succès", "success");
      setModalAjust(false);
      await Promise.all([load(), loadAlertes()]);
    } catch (e) { toast(String(e), "error"); }
    setSaving(false);
  };

  const nouveauStockPreview = selectedFormat && quantite
    ? selectedFormat.stock + (parseInt(quantite) || 0)
    : null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="Réapprovisionnement"
        subtitle={alertes.length > 0 ? `${alertes.length} produit${alertes.length > 1 ? "s" : ""} en alerte` : "Tous les stocks sont suffisants"}
        actions={
          <div className="flex gap-2">
            <Button size="sm" icon={<Send size={14} />} onClick={() => setBonCommande(true)}>Bon de commande</Button>
            <Button variant="secondary" icon={<RefreshCw size={15} />} onClick={() => load()} size="sm">
              Actualiser
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-28 lg:pb-8 [&>*]:w-full [&>*]:max-w-4xl [&>*]:mx-auto flex flex-col gap-4">
        {/* Formats en alerte */}
        <div className="flex flex-col gap-3">
          {loading ? (
            <Skeleton variant="card" count={3} />
          ) : alertes.length === 0 ? (
            <Card className="text-center py-16">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                <RefreshCw size={28} className="text-secondary" />
              </div>
              <p className="font-semibold text-gray-700">Tous les stocks sont suffisants !</p>
              <p className="text-gray-400 text-sm mt-1">Aucun produit ne nécessite de réapprovisionnement.</p>
            </Card>
          ) : (
            <>
              <div className="flex items-center gap-2 px-1">
                <AlertTriangle size={16} className="text-danger" />
                <span className="text-sm font-semibold text-danger">
                  {alertes.length} produit{alertes.length > 1 ? "s" : ""} sous le seuil d'alerte
                </span>
              </div>
              {alertes.map(f => (
                <Card key={f.id} className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-800">{f.produit_nom}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{volumeFr(f.volume, f.unite)}</div>
                    <div className="mt-2 flex items-center gap-3">
                      <div>
                        <div className="text-[10px] text-gray-400 uppercase font-semibold">Stock actuel</div>
                        <div className="text-2xl font-extrabold text-danger leading-none">{f.stock}</div>
                      </div>
                      <div className="text-gray-300">→</div>
                      <div>
                        <div className="text-[10px] text-gray-400 uppercase font-semibold">Seuil</div>
                        <div className="text-2xl font-extrabold text-gray-600 leading-none">{f.seuil_alerte}</div>
                      </div>
                      <div className="text-gray-300">→</div>
                      <div>
                        <div className="text-[10px] text-gray-400 uppercase font-semibold">Manquant</div>
                        <div className="text-2xl font-extrabold text-warning leading-none">{f.quantite_manquante}</div>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <Button size="sm" icon={<Plus size={14} />} onClick={() => openReappro(f)}>Réappro</Button>
                    <Button size="sm" variant="secondary" onClick={() => openAjust(f)}>Ajuster</Button>
                  </div>
                </Card>
              ))}
            </>
          )}
        </div>

        {/* Historique récent des entrées */}
        {!loading && historique.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3 px-1">
              <History size={15} className="text-gray-400" />
              <span className="text-sm font-semibold text-gray-600">Dernières entrées de stock</span>
            </div>
            <Card padding="none">
              {historique.map(m => (
                <div key={m.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
                  <Badge variant="success">+{m.quantite}</Badge>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">
                      {m.produit_nom} {volumeFr(m.volume, m.unite)}
                    </div>
                    <div className="text-xs text-gray-400">{formatDate(m.date)}</div>
                    {m.commentaire && (
                      <div className="text-xs text-gray-400 italic truncate">{m.commentaire}</div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0 text-xs text-gray-400">
                    {m.stock_avant} → <span className="text-secondary font-semibold">{m.stock_apres}</span>
                  </div>
                </div>
              ))}
            </Card>
          </div>
        )}
      </div>

      {/* Modal réapprovisionnement */}
      <Modal isOpen={modal} onClose={() => setModal(false)} title="Réapprovisionnement">
        {selectedFormat && (
          <div className="p-6 flex flex-col gap-4">
            <div className="bg-slate-50 rounded-lg p-3 text-sm">
              <div className="font-semibold">{selectedFormat.produit_nom} {volumeFr(selectedFormat.volume, selectedFormat.unite)}</div>
              <div className="text-gray-500 mt-0.5">Stock actuel : <strong className="text-danger">{selectedFormat.stock}</strong></div>
            </div>
            <Input label="Nombre de casiers à ajouter" type="number" min="1" value={quantite}
              onChange={e => setQuantite(e.target.value)} />
            {nouveauStockPreview !== null && (
              <div className="bg-green-50 rounded-lg px-3 py-2 text-sm flex justify-between">
                <span className="text-green-700">Nouveau stock estimé</span>
                <span className="font-extrabold text-secondary">
                  {selectedFormat.stock} + {quantite || 0} = {nouveauStockPreview}
                </span>
              </div>
            )}
            <Input label="Commentaire (optionnel)" value={commentaire}
              onChange={e => setCommentaire(e.target.value)} placeholder="ex. : Livraison fournisseur" />
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setModal(false)}>Annuler</Button>
              <Button onClick={saveReappro} loading={saving}>Confirmer</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal ajustement */}
      <Modal isOpen={modalAjust} onClose={() => setModalAjust(false)} title="Ajustement de stock">
        {selectedFormat && (
          <div className="p-6 flex flex-col gap-4">
            <div className="bg-slate-50 rounded-lg p-3 text-sm">
              <div className="font-semibold">{selectedFormat.produit_nom} {volumeFr(selectedFormat.volume, selectedFormat.unite)}</div>
              <div className="text-gray-500 mt-0.5">Stock actuel : <strong>{selectedFormat.stock}</strong></div>
            </div>
            <Input label="Nouveau stock" type="number" min="0" value={nouvStock}
              onChange={e => setNouvStock(e.target.value)} />
            {nouvStock !== "" && !isNaN(parseInt(nouvStock)) && (
              <div className="bg-amber-50 rounded-lg px-3 py-2 text-sm flex justify-between">
                <span className="text-amber-700">Changement</span>
                <span className="font-semibold text-gray-700">
                  {selectedFormat.stock} → <strong>{parseInt(nouvStock)}</strong>
                  {" "}({parseInt(nouvStock) - selectedFormat.stock >= 0 ? "+" : ""}
                  {parseInt(nouvStock) - selectedFormat.stock})
                </span>
              </div>
            )}
            <Input label="Commentaire (optionnel)" value={commentaire}
              onChange={e => setCommentaire(e.target.value)} placeholder="ex. : Inventaire physique" />
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setModalAjust(false)}>Annuler</Button>
              <Button onClick={saveAjust} loading={saving} variant="secondary">Ajuster</Button>
            </div>
          </div>
        )}
      </Modal>
      <ModalBonCommande isOpen={bonCommande} onClose={() => setBonCommande(false)} />
    </div>
  );
}
