import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShoppingCart, Bell, Package, Wallet, ChevronRight, CheckCircle2, Trophy, DatabaseBackup,
  TrendingUp, TrendingDown, RefreshCw, AlertTriangle, PackagePlus, History, ArrowUpRight,
} from "lucide-react";
import { invoke } from "@/lib/db";
import Card from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";
import { joursDepuisDerniereSauvegarde } from "@/components/sauvegarde/CarteSauvegarde";
import { useTempsReel } from "@/lib/tempsReel";
import { useAppStore } from "@/stores/appStore";
import { useAuthStore } from "@/stores/authStore";
import { volumeFr, casiers } from "@/lib/format";
import Avatar from "@/components/ui/Avatar";

interface StatsDashboard {
  ca_jour: number;
  ca_hier: number;
  ventes_jour: number;
  formats_en_alerte: number;
  total_produits: number;
  top_produits: { produit_nom: string; total_vendu: number }[];
  total_dettes: number;
  clients_debiteurs: number;
  emballages_dehors: { nom: string; quantite: number }[];
  semaine: { jour: string; ca: number; ventes: number }[];
}

const REFRESH_MS = 5 * 60 * 1000; // 5 minutes

export default function Dashboard() {
  const navigate = useNavigate();
  const { alertes, loadAlertes, setNombreAlertes, formatMontant } = useAppStore();
  const formatPrix = formatMontant;
  const profil = useAuthStore((s) => s.profil);

  const [stats, setStats] = useState<StatsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadStats = async () => {
    try {
      const s = await invoke<StatsDashboard>("get_stats_dashboard");
      setStats(s);
      setNombreAlertes(s.formats_en_alerte);
      setError(null);
      setLastRefresh(new Date());
    } catch (e) {
      setError(String(e));
    }
  };

  // Rappel de sauvegarde : l'offre gratuite de Firebase n'en fait pas automatiquement
  const [joursSansSauvegarde, setJoursSansSauvegarde] = useState<number | null>(null);
  // Ventes, stock et dettes modifiés sur un autre appareil : chiffres rafraîchis en direct
  useTempsReel(["stock", "clients", "ventes_du_jour"], () => { loadStats(); });


  const loadAll = async () => {
    setLoading(true);
    await Promise.all([
      loadStats(),
      loadAlertes(),
      invoke<{ derniere_sauvegarde?: string | null; derniere_sauvegarde_auto?: string | null }>("get_parametres")
        .then(p => setJoursSansSauvegarde(joursDepuisDerniereSauvegarde(p) ?? 999))
        .catch(() => {}),
    ]);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
    // Auto-refresh toutes les 5 minutes
    intervalRef.current = setInterval(loadStats, REFRESH_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const diff = stats ? stats.ca_jour - stats.ca_hier : 0;
  const diffPct = stats && stats.ca_hier > 0
    ? ((diff / stats.ca_hier) * 100).toFixed(0)
    : null;
  const maxVentes = stats?.top_produits[0]?.total_vendu ?? 1;
  const alertesPreview = alertes.slice(0, 3);

  const today = new Date().toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const prenom = (profil?.nom ?? "").split(" ")[0];
  const heure = new Date().getHours();
  const salutation = heure < 13 ? "Bonjour" : heure < 18 ? "Bon après-midi" : "Bonsoir";
  const enAlerte = stats?.formats_en_alerte ?? 0;

  const semaine = stats?.semaine ?? [];
  const maxSemaine = Math.max(1, ...semaine.map(j => j.ca));
  const caSemaine = semaine.reduce((s, j) => s + j.ca, 0);
  const casiersDehors = (stats?.emballages_dehors ?? []).reduce((s, e) => s + e.quantite, 0);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto pb-28 lg:pb-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-[calc(1.25rem+env(safe-area-inset-top))] sm:pt-8 flex flex-col gap-4 sm:gap-5">

          {/* Salutation */}
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-[13px] text-gray-500">{today.charAt(0).toUpperCase() + today.slice(1)}</div>
              <h1 className="text-[26px] sm:text-[32px] font-extrabold text-ink-900 leading-tight mt-0.5">
                {salutation}{prenom ? `, ${prenom}` : ""}
              </h1>
            </div>
            <button onClick={loadAll} aria-label="Actualiser"
              title={lastRefresh ? `Actualisé à ${lastRefresh.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : "Actualiser"}
              className="h-10 w-10 sm:w-auto sm:px-3.5 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center gap-2 text-[13px] font-medium text-gray-700 hover:bg-slate-50 transition-colors flex-shrink-0">
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
              <span className="hidden sm:inline">Actualiser</span>
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex items-center gap-3">
              <AlertTriangle size={16} className="text-danger flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-danger">Erreur de chargement</p>
                <p className="text-xs text-red-500 truncate">{error}</p>
              </div>
              <button onClick={loadAll} className="text-xs text-danger font-semibold hover:underline flex-shrink-0">Réessayer</button>
            </div>
          )}

          {joursSansSauvegarde !== null && joursSansSauvegarde >= 8 && (
            <button onClick={() => navigate("/parametres")}
              className="flex items-center gap-3 text-left rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 hover:bg-amber-100/60 transition-colors">
              <DatabaseBackup size={18} className="text-amber-700 flex-shrink-0" />
              <span className="flex-1 text-sm text-amber-900">
                <span className="font-semibold">Pensez à sauvegarder vos données.</span>{" "}
                {joursSansSauvegarde >= 999 ? "Aucune sauvegarde pour l'instant." : `Dernière sauvegarde il y a ${joursSansSauvegarde} jours.`}
              </span>
              <ChevronRight size={16} className="text-amber-700" />
            </button>
          )}

          {/* ── Bento ─────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">

            {/* Chiffre du jour + 7 jours */}
            <section className="lg:col-span-2 relative overflow-hidden rounded-3xl bg-ink-900 text-white p-5 sm:p-7">
              <div className="pointer-events-none absolute -top-24 -right-20 w-72 h-72 rounded-full bg-secondary-500/20 blur-3xl" />
              <div className="relative flex flex-wrap items-start justify-between gap-x-3 gap-y-4">
                <div>
                  <div className="text-[13px] font-medium text-ink-300">Chiffre d'affaires du jour</div>
                  {loading ? <div className="h-12 w-56 mt-2 rounded-xl bg-white/10 animate-pulse" /> : (
                    <div className="chiffre text-[34px] sm:text-[56px] font-extrabold leading-none mt-2 whitespace-nowrap">{formatPrix(stats?.ca_jour ?? 0)}</div>
                  )}
                  {!loading && (diffPct !== null ? (
                    <span className={["inline-flex items-center gap-1 mt-3 text-xs font-semibold px-2 py-1 rounded-lg",
                      diff >= 0 ? "bg-secondary-400/15 text-secondary-300" : "bg-red-400/15 text-red-300"].join(" ")}>
                      {diff >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                      {diff >= 0 ? "+" : ""}{diffPct} % par rapport à hier
                    </span>
                  ) : (
                    <span className="inline-block mt-3 text-xs text-ink-400">Pas de vente hier pour comparer</span>
                  ))}
                </div>
                <div className="sm:text-right flex-shrink-0 order-last sm:order-none w-full sm:w-auto flex sm:block items-baseline justify-between border-t border-white/10 pt-3 sm:border-0 sm:pt-0">
                  <div className="text-[12px] text-ink-400">7 derniers jours</div>
                  <div className="chiffre text-lg sm:text-xl font-bold mt-0.5">{formatPrix(caSemaine)}</div>
                </div>
              </div>

              {/* Graphique : une barre par jour, aujourd'hui en vert */}
              <div className="relative mt-6 sm:mt-8 grid grid-cols-7 gap-2 sm:gap-3 items-end h-28 sm:h-32">
                {(semaine.length ? semaine : Array.from({ length: 7 }, (_, i) => ({ jour: String(i), ca: 0, ventes: 0 }))).map((j, i) => {
                  const estAujourdhui = i === 6;
                  const hauteur = Math.max(4, Math.round((j.ca / maxSemaine) * 100));
                  const libelle = semaine.length
                    ? new Date(`${j.jour}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "")
                    : "";
                  return (
                    <div key={j.jour} className="flex flex-col items-center gap-2 h-full justify-end"
                      title={semaine.length ? `${libelle} : ${formatPrix(j.ca)} · ${j.ventes} vente${j.ventes > 1 ? "s" : ""}` : undefined}>
                      <div className="w-full flex-1 flex items-end">
                        <div className={["w-full rounded-lg transition-all duration-500",
                          estAujourdhui ? "bg-gradient-to-t from-secondary-600 to-secondary-400" : "bg-white/[0.12] hover:bg-white/20"].join(" ")}
                          style={{ height: `${loading ? 4 : hauteur}%` }} />
                      </div>
                      <span className={["text-[11px] capitalize", estAujourdhui ? "text-white font-semibold" : "text-ink-400"].join(" ")}>{libelle}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Actions rapides */}
            <section className="grid grid-cols-2 gap-3 content-start">
              <ActionRapide onClick={() => navigate("/vente")} icone={<ShoppingCart size={20} />} titre="Nouvelle vente" principale />
              <ActionRapide onClick={() => navigate("/clients")} icone={<Wallet size={20} />} titre="Encaisser une dette" />
              <ActionRapide onClick={() => navigate("/reappro")} icone={<PackagePlus size={20} />} titre="Réapprovisionner" />
              <ActionRapide onClick={() => navigate("/historique")} icone={<History size={20} />} titre="Historique" />
            </section>

            {/* Compteurs */}
            <div className="lg:col-span-3 grid grid-cols-3 gap-3 sm:gap-5">
              {loading ? (
                <>
                  <Skeleton variant="card" className="h-28" />
                  <Skeleton variant="card" className="h-28" />
                  <Skeleton variant="card" className="h-28" />
                </>
              ) : (
                <>
                  <Indicateur titre="Ventes du jour" valeur={stats?.ventes_jour ?? 0}
                    detail={`${(stats?.ventes_jour ?? 0) > 1 ? "ventes" : "vente"} enregistrée${(stats?.ventes_jour ?? 0) > 1 ? "s" : ""}`}
                    icone={<ShoppingCart size={15} />} teinte="bg-sky-50 text-sky-600"
                    onClick={() => navigate("/historique")} />
                  <Indicateur titre="Alertes de stock" valeur={enAlerte}
                    detail={enAlerte > 0 ? "à réapprovisionner" : "tout est en stock"}
                    icone={<Bell size={15} />}
                    teinte={enAlerte > 0 ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"}
                    valeurClasse={enAlerte > 0 ? "text-red-600" : "text-ink-900"}
                    onClick={() => navigate("/alertes")} />
                  <Indicateur titre="Casiers dehors" valeur={casiersDehors}
                    detail="chez les clients" icone={<Package size={15} />} teinte="bg-amber-50 text-amber-600"
                    onClick={() => navigate("/clients")} />
                </>
              )}
            </div>

            {/* Ce que les clients doivent */}
            <Card padding="none" className="overflow-hidden lg:col-span-1">
              <div className="p-5 flex flex-col gap-4 h-full">
                <div className="flex items-center justify-between">
                  <h2 className="text-[15px] font-bold text-ink-900">Ce que les clients doivent</h2>
                  <button onClick={() => navigate("/clients")} className="text-[13px] text-gray-500 hover:text-ink-900 flex items-center h-10 px-2 -mr-2 rounded-lg">
                    Voir <ChevronRight size={14} />
                  </button>
                </div>
                {loading ? <Skeleton variant="text" count={2} /> : (
                  <>
                    <div>
                      <div className={["chiffre text-[30px] font-extrabold leading-none", (stats?.total_dettes ?? 0) > 0 ? "text-orange-600" : "text-ink-900"].join(" ")}>
                        {formatPrix(stats?.total_dettes ?? 0)}
                      </div>
                      <div className="text-[13px] text-gray-500 mt-1.5">
                        {(stats?.clients_debiteurs ?? 0) > 0
                          ? `${stats!.clients_debiteurs} client${stats!.clients_debiteurs > 1 ? "s" : ""} à crédit`
                          : "Aucune dette en cours"}
                      </div>
                    </div>
                    {(stats?.emballages_dehors ?? []).length > 0 && (
                      <div className="flex flex-col gap-2 pt-4 border-t border-slate-100">
                        {stats!.emballages_dehors.map(e => (
                          <div key={e.nom} className="flex items-center justify-between text-[13px]">
                            <span className="text-gray-600 truncate">{e.nom}</span>
                            <span className="chiffre font-bold text-ink-900">{e.quantite}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </Card>

            {/* Meilleures ventes */}
            <Card padding="none" className="lg:col-span-1">
              <div className="p-5 flex flex-col gap-4">
                <h2 className="text-[15px] font-bold text-ink-900 flex items-center gap-2">
                  <Trophy size={16} className="text-amber-500" /> Meilleures ventes du jour
                </h2>
                {loading ? <Skeleton variant="text" count={3} /> : stats && stats.top_produits.length > 0 ? (
                  <div className="flex flex-col gap-3.5">
                    {stats.top_produits.map(p => (
                      <div key={p.produit_nom} className="flex items-center gap-3">
                        <Avatar nom={p.produit_nom} taille="sm" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[13.5px] font-semibold text-ink-900 truncate">{p.produit_nom}</span>
                            <span className="chiffre text-[13px] font-bold text-ink-900">{casiers(p.total_vendu)}</span>
                          </div>
                          <div className="mt-1.5 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-secondary-500" style={{ width: `${(p.total_vendu / maxVentes) * 100}%` }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-gray-500 text-sm">Aucune vente aujourd'hui</p>
                    <button onClick={() => navigate("/vente")} className="mt-2 inline-flex items-center text-secondary-700 font-semibold text-sm hover:underline">
                      Enregistrer une vente <ChevronRight size={15} />
                    </button>
                  </div>
                )}
              </div>
            </Card>

            {/* À réapprovisionner */}
            <Card padding="none" className="lg:col-span-1">
              <div className="p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-[15px] font-bold text-ink-900 flex items-center gap-2">
                    <AlertTriangle size={16} className={alertesPreview.length > 0 ? "text-red-500" : "text-emerald-500"} /> À réapprovisionner
                  </h2>
                  {alertesPreview.length > 0 && (
                    <button onClick={() => navigate("/alertes")} className="text-[13px] text-gray-500 hover:text-ink-900 flex items-center">
                      Tout voir <ChevronRight size={14} />
                    </button>
                  )}
                </div>
                {loading ? <Skeleton variant="text" count={3} /> : alertesPreview.length === 0 ? (
                  <div className="text-center py-4">
                    <div className="w-11 h-11 mx-auto rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 mb-2">
                      <CheckCircle2 size={22} />
                    </div>
                    <p className="text-ink-900 font-semibold text-sm">Tout est en stock</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {alertesPreview.map(a => (
                      <button key={a.id} onClick={() => navigate("/alertes")} className="flex items-center gap-3 text-left group">
                        <Avatar nom={a.produit_nom} taille="sm" />
                        <div className="flex-1 min-w-0">
                          <div className="text-[13.5px] font-semibold text-ink-900 truncate group-hover:underline">{a.produit_nom}</div>
                          <div className="text-xs text-gray-500">{volumeFr(a.volume, a.unite, a.casier)} · seuil {a.seuil_alerte}</div>
                        </div>
                        <span className={["chiffre text-sm font-bold px-2 py-0.5 rounded-md",
                          a.stock <= 0 ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700"].join(" ")}>{a.stock}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionRapide({ onClick, icone, titre, principale = false }: {
  onClick: () => void; icone: React.ReactNode; titre: string; principale?: boolean;
}) {
  return (
    <button onClick={onClick}
      className={["group rounded-2xl p-4 flex flex-col justify-between gap-6 text-left min-h-[108px] transition-all active:scale-[0.98]",
        principale
          ? "bg-gradient-to-br from-secondary-500 to-secondary-700 text-white shadow-[0_10px_24px_-10px_rgba(5,150,105,0.7)] hover:brightness-105"
          : "bg-white border border-slate-200 text-ink-900 hover:border-slate-300 shadow-sm"].join(" ")}>
      <span className={["w-9 h-9 rounded-xl flex items-center justify-center",
        principale ? "bg-white/20" : "bg-slate-100 text-ink-700 group-hover:bg-slate-200"].join(" ")}>{icone}</span>
      <span className="text-[14px] font-semibold leading-tight flex items-center justify-between gap-1">
        {titre}<ArrowUpRight size={15} className={principale ? "opacity-80" : "text-gray-400"} />
      </span>
    </button>
  );
}

function Indicateur({ titre, valeur, detail, icone, teinte, valeurClasse = "text-ink-900", onClick }: {
  titre: string; valeur: number; detail: string; icone: React.ReactNode;
  teinte: string; valeurClasse?: string; onClick?: () => void;
}) {
  return (
    <Card onClick={onClick} padding="sm" className="flex flex-col gap-3 sm:p-5 rounded-2xl">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11.5px] sm:text-[13px] font-medium text-gray-500 leading-tight">{titre}</span>
        <span className={["hidden sm:flex w-8 h-8 rounded-lg items-center justify-center flex-shrink-0", teinte].join(" ")}>{icone}</span>
      </div>
      <div>
        <div className={["chiffre text-[26px] sm:text-[34px] font-extrabold leading-none", valeurClasse].join(" ")}>{valeur}</div>
        <div className="text-[11.5px] sm:text-[12.5px] text-gray-500 mt-1.5 leading-tight">{detail}</div>
      </div>
    </Card>
  );
}
