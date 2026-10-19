import { useEffect, useState } from "react";
import { Search, RotateCcw, Check, TrendingUp, Layers, Eraser } from "lucide-react";
import { invoke } from "@/lib/db";
import { useToast } from "@/components/ui/Toast";
import { useAppStore } from "@/stores/appStore";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import ModalAjustementPrix from "@/components/prix/ModalAjustementPrix";
import { volumeFr } from "@/lib/format";
import Pastilles from "@/components/ui/Pastilles";
import { grouperParFamille, type CleFamille } from "@/lib/familles";

export interface PrixClient { casier?: number | null;
  famille: CleFamille;
  format_id: string; produit_id: string; produit_nom: string;
  volume: number; unite: string; prix_base: number;
  /** Prix du groupe du client (null : pas de groupe ou pas de prix pour ce format) */
  prix_groupe: number | null; groupe_nom: string | null;
  /** Prix propre (client) ou prix de la grille (groupe) */
  prix_client: number | null; date_maj: string | null;
}

interface Props {
  /** Prix propres d'un client… */
  client?: { id: string; nom: string } | null;
  /** …ou grille d'un groupe de prix */
  groupe?: { id: string; nom: string } | null;
  onClose: () => void;
  /** Appelé quand la fiche change (groupe créé à partir du client, prix vidés) */
  onChange?: () => void;
}

export default function ModalPrixClient({ client, groupe, onClose, onChange }: Props) {
  const { toast } = useToast();
  const formatPrix = useAppStore((s) => s.formatMontant);
  const cible = client ?? groupe ?? null;
  const estGroupe = !client && !!groupe;
  const [lignes, setLignes] = useState<PrixClient[]>([]);
  const [saisies, setSaisies] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [famille, setFamille] = useState<"toutes" | CleFamille>("toutes");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showHausse, setShowHausse] = useState(false);
  const [busy, setBusy] = useState(false);

  const cmd = estGroupe
    ? { lire: "get_prix_groupe", ecrire: "set_prix_groupe", effacer: "delete_prix_groupe", cle: { groupeId: cible?.id } }
    : { lire: "get_prix_client", ecrire: "set_prix_client", effacer: "delete_prix_client", cle: { clientId: cible?.id } };

  const load = async () => {
    if (!cible) return;
    setLoading(true);
    try {
      const data = await invoke<PrixClient[]>(cmd.lire, cmd.cle);
      setLignes(data);
      setSaisies(Object.fromEntries(data.map(l => [l.format_id, l.prix_client != null ? String(l.prix_client) : ""])));
    } catch (e) { toast(String(e), "error"); }
    setLoading(false);
  };
  useEffect(() => { setSearch(""); setFamille("toutes"); load(); }, [cible?.id]);

  const enregistrer = async (l: PrixClient) => {
    const prix = parseFloat(saisies[l.format_id]);
    if (isNaN(prix) || prix <= 0) { toast("Prix invalide", "error"); return; }
    setSavingId(l.format_id);
    try {
      await invoke(cmd.ecrire, { ...cmd.cle, formatId: l.format_id, prix });
      toast(`Prix enregistré pour ${l.produit_nom} ${volumeFr(l.volume, l.unite, l.casier)}`, "success");
      await load();
    } catch (e) { toast(String(e), "error"); }
    setSavingId(null);
  };

  const reinitialiser = async (l: PrixClient) => {
    setSavingId(l.format_id);
    try {
      await invoke(cmd.effacer, { ...cmd.cle, formatId: l.format_id });
      toast(l.prix_groupe != null ? "Prix du groupe rétabli" : "Prix comptoir rétabli", "success");
      await load();
    } catch (e) { toast(String(e), "error"); }
    setSavingId(null);
  };

  const groupeNom = lignes[0]?.groupe_nom ?? null;
  const nbPropres = lignes.filter(l => l.prix_client != null).length;

  /** Fait de ces prix un groupe réutilisable pour d'autres clients. */
  const creerGroupe = async () => {
    const nom = prompt(`Nom du groupe créé avec les prix de ${cible?.nom} :`, "");
    if (!nom?.trim()) return;
    setBusy(true);
    try {
      await invoke("creer_groupe_depuis_client", { clientId: cible!.id, nom: nom.trim() });
      toast(`Groupe « ${nom.trim()} » créé, ${cible?.nom} en fait partie`, "success");
      onChange?.();
      await load();
    } catch (e) { toast(String(e), "error"); }
    setBusy(false);
  };

  const viderPrix = async () => {
    if (!confirm(`Effacer les ${nbPropres} prix propres de ${cible?.nom} ? Il suivra entièrement le groupe « ${groupeNom} ».`)) return;
    setBusy(true);
    try {
      await invoke("vider_prix_client", { clientId: cible!.id });
      toast("Prix propres effacés : le client suit son groupe", "success");
      await load();
    } catch (e) { toast(String(e), "error"); }
    setBusy(false);
  };

  // Prix hérité affiché quand la case est vide
  const herite = (l: PrixClient) => l.prix_groupe ?? l.prix_base;
  const libelleHerite = (l: PrixClient) =>
    l.prix_groupe != null ? `Groupe ${formatPrix(l.prix_groupe)}` : `Comptoir ${formatPrix(l.prix_base)}`;

  const trouvees = lignes.filter(l => l.produit_nom.toLowerCase().includes(search.toLowerCase()));
  const groupes = grouperParFamille(trouvees, l => l.famille);
  const affiches = groupes.filter(g => famille === "toutes" || g.cle === famille);
  const filtered = affiches.flatMap(g => g.items);

  const explication = estGroupe
    ? "Prix communs à tous les clients de ce groupe. Case vide : prix comptoir."
    : groupeNom
      ? `Suit le groupe « ${groupeNom} ». Ne remplissez que ses prix hors du commun.`
      : "Prix propres à ce client, modifiables à tout moment. Case vide : prix comptoir.";

  return (
    <>
      <Modal isOpen={!!cible && !showHausse} onClose={onClose}
        title={estGroupe ? `Groupe — ${cible?.nom ?? ""}` : `Prix — ${cible?.nom ?? ""}`} size="lg">
        <div className="p-4 sm:p-6 flex flex-col gap-4">
          <div className="flex flex-col gap-2.5">
            <p className="text-xs text-gray-500">
              {explication}{" "}
              <span className="font-semibold text-gray-700">
                {nbPropres} prix {estGroupe ? "dans la grille" : groupeNom ? `propre${nbPropres > 1 ? "s" : ""}` : `renseigné${nbPropres > 1 ? "s" : ""}`}
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              {nbPropres > 0 && (
                <Button size="sm" variant="secondary" icon={<TrendingUp size={14} />} onClick={() => setShowHausse(true)}>
                  {estGroupe ? "Ajuster la grille" : "Ajuster ses prix"}
                </Button>
              )}
              {!estGroupe && !groupeNom && nbPropres > 0 && (
                <Button size="sm" variant="secondary" icon={<Layers size={14} />} onClick={creerGroupe} loading={busy}>
                  En faire un groupe
                </Button>
              )}
              {!estGroupe && groupeNom && nbPropres > 0 && (
                <Button size="sm" variant="secondary" icon={<Eraser size={14} />} onClick={viderPrix} loading={busy}>
                  Suivre tout le groupe
                </Button>
              )}
            </div>
          </div>
          <Input placeholder="Rechercher un produit…" value={search}
            onChange={e => setSearch(e.target.value)} icon={<Search size={16} />} />
          {groupes.length > 1 && (
            <Pastilles valeur={famille} onChange={setFamille} options={[
              { valeur: "toutes" as const, label: "Tout", compte: trouvees.length },
              ...groupes.map(g => ({ valeur: g.cle, label: g.court, compte: g.items.length })),
            ]} />
          )}

          {loading ? (
            <Skeleton variant="card" count={3} />
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">Aucun produit</p>
          ) : (
            <div className="flex flex-col gap-4">
              {affiches.map(g => (
                <section key={g.cle}>
                  <h3 className="sticky top-0 z-10 bg-white/95 backdrop-blur py-1.5 text-[12px] font-bold uppercase tracking-wide text-ink-600 flex items-center justify-between">
                    {g.label}<span className="text-gray-400 font-semibold normal-case">{g.items.length}</span>
                  </h3>
                  <div className="flex flex-col divide-y divide-slate-100 border border-slate-200 rounded-xl">
                    {g.items.map(l => {
                      const saisie = saisies[l.format_id] ?? "";
                      const modifie = saisie !== (l.prix_client != null ? String(l.prix_client) : "");
                      const propre = l.prix_client != null;
                      return (
                        <div key={l.format_id} className="flex items-center gap-2 sm:gap-3 px-3 py-2.5">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-gray-800 truncate">
                              {l.produit_nom} <span className="hidden sm:inline text-gray-400 font-normal">{volumeFr(l.volume, l.unite, l.casier)}</span>
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis">
                              {propre
                                ? (!estGroupe && l.prix_groupe != null ? <span className="text-amber-700 font-semibold">Hors groupe ({formatPrix(l.prix_groupe)})</span> : volumeFr(l.volume, l.unite, l.casier))
                                : libelleHerite(l)}
                            </div>
                          </div>
                          <input type="number" inputMode="numeric" min="0" placeholder={String(herite(l))} value={saisie}
                            onChange={e => setSaisies(s => ({ ...s, [l.format_id]: e.target.value }))}
                            onKeyDown={e => { if (e.key === "Enter" && modifie && saisie) enregistrer(l); }}
                            className={["w-[88px] sm:w-28 flex-shrink-0 rounded-lg border px-2.5 py-1.5 text-sm font-semibold text-right focus:outline-none focus:border-secondary",
                              propre ? "border-secondary/50 bg-green-50/50" : "border-gray-300"].join(" ")} />
                          <div className="flex items-center gap-0.5 w-[60px] sm:w-16 flex-shrink-0 justify-end">
                            {modifie && saisie && (
                              <button onClick={() => enregistrer(l)} disabled={savingId === l.format_id} title="Enregistrer"
                                className="p-1.5 rounded-lg bg-secondary text-white hover:bg-secondary-600 disabled:opacity-50">
                                <Check size={14} />
                              </button>
                            )}
                            {propre && (
                              <button onClick={() => reinitialiser(l)} disabled={savingId === l.format_id}
                                title={l.prix_groupe != null ? "Revenir au prix du groupe" : "Revenir au prix comptoir"}
                                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50">
                                <RotateCcw size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </Modal>

      <ModalAjustementPrix
        isOpen={showHausse}
        onClose={() => setShowHausse(false)}
        onApplied={load}
        clientFixe={estGroupe ? null : cible}
        groupeFixe={estGroupe ? cible : null}
      />
    </>
  );
}
