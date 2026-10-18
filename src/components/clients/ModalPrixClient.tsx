import { useEffect, useState } from "react";
import { Search, RotateCcw, Check, TrendingUp } from "lucide-react";
import { invoke } from "@/lib/db";
import { useToast } from "@/components/ui/Toast";
import { useAppStore } from "@/stores/appStore";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import ModalAjustementPrix from "@/components/prix/ModalAjustementPrix";
import { volumeFr } from "@/lib/format";

export interface PrixClient {
  format_id: string; produit_id: string; produit_nom: string;
  volume: number; unite: string; prix_base: number;
  prix_client: number | null; date_maj: string | null;
}

interface Props {
  client: { id: string; nom: string } | null;
  onClose: () => void;
}

export default function ModalPrixClient({ client, onClose }: Props) {
  const { toast } = useToast();
  const formatPrix = useAppStore((s) => s.formatMontant);
  const [lignes, setLignes] = useState<PrixClient[]>([]);
  const [saisies, setSaisies] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showHausse, setShowHausse] = useState(false);

  const load = async () => {
    if (!client) return;
    setLoading(true);
    try {
      const data = await invoke<PrixClient[]>("get_prix_client", { clientId: client.id });
      setLignes(data);
      setSaisies(Object.fromEntries(data.map(l => [l.format_id, l.prix_client != null ? String(l.prix_client) : ""])));
    } catch (e) { toast(String(e), "error"); }
    setLoading(false);
  };
  useEffect(() => { setSearch(""); load(); }, [client?.id]);

  const enregistrer = async (l: PrixClient) => {
    const prix = parseFloat(saisies[l.format_id]);
    if (isNaN(prix) || prix <= 0) { toast("Prix invalide", "error"); return; }
    setSavingId(l.format_id);
    try {
      await invoke("set_prix_client", { clientId: client!.id, formatId: l.format_id, prix });
      toast(`Prix enregistré pour ${l.produit_nom} ${volumeFr(l.volume, l.unite)}`, "success");
      await load();
    } catch (e) { toast(String(e), "error"); }
    setSavingId(null);
  };

  const reinitialiser = async (l: PrixClient) => {
    setSavingId(l.format_id);
    try {
      await invoke("delete_prix_client", { clientId: client!.id, formatId: l.format_id });
      toast("Prix de base rétabli", "success");
      await load();
    } catch (e) { toast(String(e), "error"); }
    setSavingId(null);
  };

  const filtered = lignes.filter(l => l.produit_nom.toLowerCase().includes(search.toLowerCase()));
  const nbSpecifiques = lignes.filter(l => l.prix_client != null).length;

  return (
    <>
      <Modal isOpen={!!client && !showHausse} onClose={onClose} title={`Prix — ${client?.nom ?? ""}`} size="lg">
        <div className="p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-gray-500">
              Laissez vide pour appliquer le prix de base.{" "}
              <span className="font-semibold text-gray-700">{nbSpecifiques} prix spécifique{nbSpecifiques > 1 ? "s" : ""}</span>
            </p>
            {nbSpecifiques > 0 && (
              <Button size="sm" variant="secondary" icon={<TrendingUp size={14} />} onClick={() => setShowHausse(true)}>
                Ajuster ses prix
              </Button>
            )}
          </div>
          <Input placeholder="Rechercher un produit…" value={search}
            onChange={e => setSearch(e.target.value)} icon={<Search size={16} />} />

          {loading ? (
            <Skeleton variant="card" count={3} />
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">Aucun produit</p>
          ) : (
            <div className="flex flex-col divide-y divide-gray-100 border border-gray-100 rounded-xl">
              {filtered.map(l => {
                const saisie = saisies[l.format_id] ?? "";
                const modifie = saisie !== (l.prix_client != null ? String(l.prix_client) : "");
                const ecart = l.prix_client != null ? l.prix_client - l.prix_base : null;
                return (
                  <div key={l.format_id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-800 truncate">
                        {l.produit_nom} <span className="text-gray-400 font-normal">{volumeFr(l.volume, l.unite)}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-400">Base : {formatPrix(l.prix_base)}</span>
                        {ecart != null && ecart !== 0 && (
                          <Badge variant={ecart < 0 ? "success" : "warning"}>
                            {ecart > 0 ? "+" : ""}{formatPrix(ecart)}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <input type="number" min="0" placeholder={String(l.prix_base)} value={saisie}
                      onChange={e => setSaisies(s => ({ ...s, [l.format_id]: e.target.value }))}
                      onKeyDown={e => { if (e.key === "Enter" && modifie && saisie) enregistrer(l); }}
                      className={["w-28 rounded-lg border px-2.5 py-1.5 text-sm font-semibold text-right focus:outline-none focus:border-secondary",
                        l.prix_client != null ? "border-secondary/50 bg-green-50/50" : "border-gray-300"].join(" ")} />
                    <div className="flex items-center gap-1 w-16 justify-end">
                      {modifie && saisie && (
                        <button onClick={() => enregistrer(l)} disabled={savingId === l.format_id} title="Enregistrer"
                          className="p-1.5 rounded-lg bg-secondary text-white hover:bg-secondary-600 disabled:opacity-50">
                          <Check size={14} />
                        </button>
                      )}
                      {l.prix_client != null && (
                        <button onClick={() => reinitialiser(l)} disabled={savingId === l.format_id} title="Revenir au prix de base"
                          className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50">
                          <RotateCcw size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Modal>

      <ModalAjustementPrix
        isOpen={showHausse}
        onClose={() => setShowHausse(false)}
        onApplied={load}
        clientFixe={client}
      />
    </>
  );
}
