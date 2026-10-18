import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShoppingCart, Bell, Package, Wallet, ChevronRight, CheckCircle2, Trophy, DatabaseBackup,
  TrendingUp, TrendingDown, RefreshCw, AlertTriangle,
} from "lucide-react";
import { invoke } from "@/lib/db";
import Card from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";
import { joursDepuisDerniereSauvegarde } from "@/components/sauvegarde/CarteSauvegarde";
import { useTempsReel } from "@/lib/tempsReel";
import { useAppStore } from "@/stores/appStore";
import { useAuthStore } from "@/stores/authStore";
import { volumeFr } from "@/lib/format";

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

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto pb-24 lg:pb-8">
        {/* En-tête : salutation et chiffre du jour */}
        <div className="bg-white border-b border-slate-200 px-4 sm:px-6 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-6 sm:pt-8 sm:pb-8">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[13px] text-gray-500">{today.charAt(0).toUpperCase() + today.slice(1)}</div>
                <h1 className="text-gray-900 text-xl sm:text-2xl font-bold tracking-tight mt-0.5">
                  {salutation}{prenom ? `, ${prenom}` : ""}
                </h1>
              </div>
              <button
                onClick={loadAll}
                className="h-9 px-3 rounded-lg border border-slate-300 shadow-sm flex items-center gap-2 text-[13px] font-medium text-gray-700 hover:bg-slate-50 transition-colors flex-shrink-0"
                title={lastRefresh ? `Actualisé à ${lastRefresh.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : "Actualiser"}
                aria-label="Actualiser"
              >
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                <span className="hidden sm:inline">Actualiser</span>
              </button>
            </div>

            <div className="mt-6">
              <div className="text-[13px] font-medium text-gray-500">Chiffre d'affaires du jour</div>
              {loading ? (
                <div className="h-11 w-56 mt-2 rounded-lg bg-slate-100 animate-pulse" />
              ) : (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-1">
                  <span className="text-gray-900 text-4xl sm:text-5xl font-bold tracking-tight tabular-nums">{formatPrix(stats?.ca_jour ?? 0)}</span>
                  {diffPct !== null ? (
                    <span className={["inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md",
                      diff >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"].join(" ")}>
                      {diff >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                      {diff >= 0 ? "+" : ""}{diffPct} % vs hier
                    </span>
                  ) : (
                    <span className="text-gray-400 text-xs">Pas de vente hier pour comparer</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 sm:py-6 flex flex-col gap-5">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex items-center gap-3">
              <AlertTriangle size={16} className="text-danger flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-danger">Erreur de chargement</p>
                <p className="text-xs text-red-500 truncate">{error}</p>
              </div>
              <button onClick={loadAll} className="text-xs text-danger font-semibold hover:underline flex-shrink-0">
                Réessayer
              </button>
            </div>
          )}

          {joursSansSauvegarde !== null && joursSansSauvegarde >= 7 && (
            <Card onClick={() => navigate("/parametres")} padding="sm" className="flex items-center gap-3 bg-amber-50 border-amber-200">
              <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
                <DatabaseBackup size={17} />
              </div>
              <div className="flex-1 min-w-0 text-sm">
                <div className="font-semibold text-amber-900">Pensez à sauvegarder vos données</div>
                <div className="text-xs text-amber-800">
                  {joursSansSauvegarde >= 999 ? "Aucune sauvegarde pour l'instant." : `Dernière sauvegarde il y a ${joursSansSauvegarde} jours.`}
                </div>
              </div>
              <ChevronRight size={16} className="text-amber-700 flex-shrink-0" />
            </Card>
          )}

          {/* Indicateurs */}
          <div className="grid grid-cols-3 gap-3">
            {loading ? (
              <>
                <Skeleton variant="card" className="h-28" />
                <Skeleton variant="card" className="h-28" />
                <Skeleton variant="card" className="h-28" />
              </>
            ) : (
              <>
                <Indicateur titre="Ventes" valeur={stats?.ventes_jour ?? 0}
                  detail={(stats?.ventes_jour ?? 0) > 1 ? "ventes" : "vente"}
                  icone={<ShoppingCart size={14} />} teinte="bg-primary-50 text-primary-600"
                  onClick={() => navigate("/historique")} />
                <Indicateur titre="Alertes" valeur={enAlerte}
                  detail={enAlerte > 0 ? "en alerte" : "tout est OK"}
                  icone={<Bell size={14} />}
                  teinte={enAlerte > 0 ? "bg-red-50 text-danger" : "bg-secondary-50 text-secondary-600"}
                  valeurClasse={enAlerte > 0 ? "text-danger" : "text-secondary-600"}
                  onClick={() => navigate("/alertes")} />
                <Indicateur titre="Produits" valeur={stats?.total_produits ?? 0}
                  detail={(stats?.total_produits ?? 0) > 1 ? "références" : "référence"} icone={<Package size={14} />} teinte="bg-amber-50 text-amber-600"
                  onClick={() => navigate("/produits")} />
              </>
            )}
          </div>

          {/* Ce que les clients doivent au dépôt : argent et casiers */}
          {!loading && stats && (stats.total_dettes > 0 || stats.emballages_dehors.length > 0) && (
            <Card onClick={() => navigate("/clients")} className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <Wallet size={16} className="text-orange-600" /> Ce que les clients doivent
                </span>
                <span className="flex items-center text-[13px] text-gray-500 font-medium">Voir <ChevronRight size={14} /></span>
              </div>
              <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
                {stats.total_dettes > 0 && (
                  <div>
                    <div className="text-2xl font-extrabold text-orange-700 tabular-nums">{formatPrix(stats.total_dettes)}</div>
                    <div className="text-xs text-gray-500">{stats.clients_debiteurs} client{stats.clients_debiteurs > 1 ? "s" : ""} à crédit</div>
                  </div>
                )}
                {stats.emballages_dehors.map(e => (
                  <div key={e.nom}>
                    <div className="text-2xl font-extrabold text-gray-800 tabular-nums">{e.quantite}</div>
                    <div className="text-xs text-gray-500">{e.nom}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <div className="grid lg:grid-cols-2 gap-5">
            {/* Produits à réapprovisionner */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
                  <AlertTriangle size={15} className={alertesPreview.length > 0 ? "text-danger" : "text-secondary"} />
                  Produits à réapprovisionner
                </h2>
                {alertesPreview.length > 0 && (
                  <button onClick={() => navigate("/alertes")} className="flex items-center text-xs text-secondary-700 font-semibold hover:underline">
                    Voir tout <ChevronRight size={14} />
                  </button>
                )}
              </div>
              {loading ? <Skeleton variant="card" count={2} /> : alertesPreview.length === 0 ? (
                <Card className="py-6 text-center">
                  <div className="w-11 h-11 mx-auto rounded-full bg-secondary-50 flex items-center justify-center text-secondary-600 mb-2">
                    <CheckCircle2 size={22} />
                  </div>
                  <p className="text-gray-800 font-semibold text-sm">Tout est en stock</p>
                  <p className="text-gray-400 text-xs mt-0.5">Aucun produit sous le seuil d'alerte.</p>
                </Card>
              ) : (
                <div className="flex flex-col gap-2">
                  {alertesPreview.map(a => (
                    <Card key={a.id} padding="sm" onClick={() => navigate("/alertes")} className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-red-50 text-danger flex items-center justify-center flex-shrink-0">
                        <Package size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm text-gray-900 truncate">{a.produit_nom}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{volumeFr(a.volume, a.unite)} · seuil {a.seuil_alerte}</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-lg font-extrabold text-danger leading-none tabular-nums">{a.stock}</div>
                        <div className="text-[11px] text-gray-400">en stock</div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            {/* Meilleures ventes du jour */}
            <section>
              <h2 className="font-bold text-gray-900 text-sm mb-3 flex items-center gap-1.5">
                <Trophy size={15} className="text-amber-500" /> Meilleures ventes du jour
              </h2>
              {loading ? <Skeleton variant="card" count={3} /> : stats && stats.top_produits.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {stats.top_produits.map((p, i) => {
                    const couleurs = ["bg-amber-400", "bg-slate-400", "bg-orange-700/70"];
                    return (
                      <Card key={i} padding="sm" className="flex items-center gap-3">
                        <span className={["w-8 h-8 rounded-full text-white text-sm font-bold flex items-center justify-center flex-shrink-0", couleurs[i]].join(" ")}>
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm text-gray-900 truncate">{p.produit_nom}</div>
                          <div className="mt-1.5 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-secondary transition-all"
                              style={{ width: `${(p.total_vendu / maxVentes) * 100}%` }} />
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-lg font-extrabold text-gray-900 leading-none tabular-nums">{p.total_vendu}</div>
                          <div className="text-[11px] text-gray-400">casier{p.total_vendu > 1 ? "s" : ""}</div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <Card className="text-center py-6">
                  <p className="text-gray-500 text-sm">Aucune vente aujourd'hui</p>
                  <button onClick={() => navigate("/vente")}
                    className="mt-2 inline-flex items-center text-secondary-700 font-semibold text-sm hover:underline">
                    Enregistrer une vente <ChevronRight size={15} />
                  </button>
                </Card>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function Indicateur({ titre, valeur, detail, icone, teinte, valeurClasse = "text-gray-900", onClick }: {
  titre: string; valeur: number; detail: string; icone: React.ReactNode;
  teinte: string; valeurClasse?: string; onClick?: () => void;
}) {
  return (
    <Card onClick={onClick} padding="sm" className="flex flex-col gap-3 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] sm:text-[13px] font-medium text-gray-500 truncate">{titre}</span>
        <span className={["hidden sm:flex w-7 h-7 rounded-md items-center justify-center flex-shrink-0", teinte].join(" ")}>{icone}</span>
      </div>
      <div>
        <div className={["text-2xl sm:text-3xl font-bold tracking-tight leading-none tabular-nums", valeurClasse].join(" ")}>{valeur}</div>
        <div className="text-[12px] text-gray-500 mt-1.5 leading-tight">{detail}</div>
      </div>
    </Card>
  );
}
