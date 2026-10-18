import { useEffect, useState } from "react";
import { ArrowRight, Eye } from "lucide-react";
import { invoke } from "@/lib/db";
import { useToast } from "@/components/ui/Toast";
import { useAppStore } from "@/stores/appStore";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { volumeFr } from "@/lib/format";

interface ChangementPrix {
  client_id: string | null; client_nom: string | null; format_id: string;
  produit_nom: string; volume: number; unite: string;
  ancien_prix: number; nouveau_prix: number;
}

type Portee = "base" | "clients" | "tous";
type Mode = "pourcentage" | "montant";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onApplied?: () => void;
  /** Si fourni, ne modifie que les prix spécifiques de ce client. */
  clientFixe?: { id: string; nom: string } | null;
}

const selectCls = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-secondary/40 focus:border-secondary";
const labelCls = "text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5";

export default function ModalAjustementPrix({ isOpen, onClose, onApplied, clientFixe }: Props) {
  const { toast } = useToast();
  const formatPrix = useAppStore((s) => s.formatMontant);
  const [produits, setProduits] = useState<{ id: string; nom: string }[]>([]);
  const [portee, setPortee] = useState<Portee>("tous");
  const [produitId, setProduitId] = useState<string>("");
  const [mode, setMode] = useState<Mode>("pourcentage");
  const [valeur, setValeur] = useState("");
  const [arrondi, setArrondi] = useState("0");
  const [apercu, setApercu] = useState<ChangementPrix[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setApercu(null); setValeur("");
    invoke<{ id: string; nom: string }[]>("get_produits").then(setProduits).catch(() => {});
  }, [isOpen]);

  // Toute modification des paramètres invalide l'aperçu
  useEffect(() => { setApercu(null); }, [portee, produitId, mode, valeur, arrondi]);

  const params = () => ({
    portee: clientFixe ? "clients" : portee,
    clientId: clientFixe?.id ?? null,
    produitId: produitId || null,
    mode,
    valeur: parseFloat(valeur),
    arrondi: parseFloat(arrondi) || 0,
  });

  const run = async (appliquer: boolean) => {
    const p = params();
    if (isNaN(p.valeur) || p.valeur === 0) { toast("Indiquez une valeur d'ajustement", "warning"); return; }
    setBusy(true);
    try {
      const res = await invoke<ChangementPrix[]>("ajuster_prix_masse", { ...p, appliquer });
      if (appliquer) {
        toast(`${res.length} prix mis à jour`, "success");
        onApplied?.();
        onClose();
      } else {
        setApercu(res);
      }
    } catch (e) { toast(String(e), "error"); }
    setBusy(false);
  };

  const nbModifies = apercu?.filter(c => c.nouveau_prix !== c.ancien_prix).length ?? 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg"
      title={clientFixe ? `Ajuster les prix — ${clientFixe.nom}` : "Ajustement des prix"}>
      <div className="p-6 flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {!clientFixe && (
            <div>
              <label className={labelCls}>Prix concernés</label>
              <select value={portee} onChange={e => setPortee(e.target.value as Portee)} className={selectCls}>
                <option value="tous">Prix de base + prix clients</option>
                <option value="base">Prix de base uniquement</option>
                <option value="clients">Prix clients uniquement</option>
              </select>
            </div>
          )}
          <div>
            <label className={labelCls}>Produit</label>
            <select value={produitId} onChange={e => setProduitId(e.target.value)} className={selectCls}>
              <option value="">Tous les produits</option>
              {produits.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Type d'ajustement</label>
            <select value={mode} onChange={e => setMode(e.target.value as Mode)} className={selectCls}>
              <option value="pourcentage">Pourcentage (%)</option>
              <option value="montant">Montant fixe</option>
            </select>
          </div>
          <Input label={mode === "pourcentage" ? "Hausse en % (négatif = baisse)" : "Hausse par unité (négatif = baisse)"}
            type="number" value={valeur} onChange={e => setValeur(e.target.value)}
            placeholder={mode === "pourcentage" ? "ex. : 10" : "ex. : 50"} />
          <div>
            <label className={labelCls}>Arrondi</label>
            <select value={arrondi} onChange={e => setArrondi(e.target.value)} className={selectCls}>
              <option value="0">Aucun</option>
              <option value="5">Multiple de 5</option>
              <option value="10">Multiple de 10</option>
              <option value="25">Multiple de 25</option>
              <option value="50">Multiple de 50</option>
              <option value="100">Multiple de 100</option>
            </select>
          </div>
        </div>

        {apercu && (
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 text-xs font-semibold text-gray-600">
              Aperçu : {nbModifies} prix modifié{nbModifies > 1 ? "s" : ""} sur {apercu.length}
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-gray-50">
              {apercu.length === 0 && <p className="text-center text-sm text-gray-400 py-6">Aucun prix concerné</p>}
              {apercu.map(c => (
                <div key={`${c.client_id ?? "base"}-${c.format_id}`} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-800 truncate">{c.produit_nom} <span className="text-gray-400">{volumeFr(c.volume, c.unite)}</span></div>
                    <div className="text-xs text-gray-400">{c.client_nom ?? "Prix de base"}</div>
                  </div>
                  <span className="text-gray-400 line-through text-xs">{formatPrix(c.ancien_prix)}</span>
                  <ArrowRight size={12} className="text-gray-300" />
                  <span className="font-bold text-primary">{formatPrix(c.nouveau_prix)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          {apercu && apercu.length > 0 ? (
            <Button onClick={() => run(true)} loading={busy}>Appliquer</Button>
          ) : (
            <Button icon={<Eye size={16} />} onClick={() => run(false)} loading={busy}>Aperçu</Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
