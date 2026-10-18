import { useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard, ShoppingCart, Package, MoreHorizontal, X, Users, RefreshCw, AlertTriangle,
  History, TrendingUp, Settings, SlidersHorizontal, LogOut, UserCog,
} from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import { useAuthStore } from "@/stores/authStore";
import { peutAcceder, ROLE_LABELS } from "@/lib/roles";

interface Item { to: string; icon: (taille: number) => React.ReactNode; label: string; badge?: number; }

export default function BottomNav() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const nombreAlertes = useAppStore((s) => s.nombreAlertes);
  const { profil, deconnexion } = useAuthStore();

  // Ordre de priorité : les 4 premières pages autorisées vont dans la barre, le reste dans « Plus »
  const tous: Item[] = [
    { to: "/",            icon: t => <LayoutDashboard size={t} />,   label: "Accueil" },
    { to: "/vente",       icon: t => <ShoppingCart size={t} />,      label: "Vente" },
    { to: "/clients",     icon: t => <Users size={t} />,             label: "Clients" },
    { to: "/produits",    icon: t => <Package size={t} />,           label: "Produits" },
    { to: "/historique",  icon: t => <History size={t} />,           label: "Historique" },
    { to: "/alertes",     icon: t => <AlertTriangle size={t} />,     label: "Alertes", badge: nombreAlertes },
    { to: "/reappro",     icon: t => <RefreshCw size={t} />,         label: "Réappro" },
    { to: "/ajustement",  icon: t => <SlidersHorizontal size={t} />, label: "Ajustement" },
    { to: "/mouvements",  icon: t => <TrendingUp size={t} />,        label: "Mouvements" },
    { to: "/utilisateurs", icon: t => <UserCog size={t} />,          label: "Utilisateurs" },
    { to: "/parametres",  icon: t => <Settings size={t} />,          label: "Paramètres" },
  ];
  const autorises = tous.filter(i => peutAcceder(profil?.role, i.to));
  const principaux = autorises.slice(0, 4);
  const autres = autorises.slice(4);
  const badgeAutres = autres.reduce((s, i) => s + (i.badge ?? 0), 0);
  const autreActif = autres.some(i => i.to === pathname);

  return (
    <>
      {/* Feuille « Plus » */}
      {drawerOpen && (
        <div className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-[2px] animate-fade-in lg:hidden" onClick={() => setDrawerOpen(false)}>
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl p-4 pb-24 shadow-modal animate-slide-up"
            onClick={e => e.stopPropagation()}>
            <div className="flex justify-center -mt-1 mb-3"><div className="w-10 h-1 rounded-full bg-slate-200" /></div>
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="font-bold text-gray-900">Menu</span>
              <button onClick={() => setDrawerOpen(false)} aria-label="Fermer" className="p-2 -mr-2 rounded-full hover:bg-slate-100">
                <X size={18} className="text-gray-500" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {autres.map(item => {
                const actif = item.to === pathname;
                return (
                  <button key={item.to}
                    onClick={() => { navigate(item.to); setDrawerOpen(false); }}
                    className={["relative flex flex-col items-center gap-2 py-4 px-2 rounded-2xl transition-colors",
                      actif ? "bg-secondary-50 text-secondary-700" : "bg-slate-50 text-primary hover:bg-slate-100"].join(" ")}>
                    {item.icon(22)}
                    <span className="text-xs font-semibold text-gray-700">{item.label}</span>
                    {(item.badge ?? 0) > 0 && (
                      <span className="absolute top-2 right-2 min-w-[18px] h-[18px] px-1 bg-danger rounded-full text-[10px] font-bold text-white flex items-center justify-center">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {profil && (
              <div className="mt-4 p-3 rounded-2xl bg-slate-50 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-secondary-400 to-secondary-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold">{profil.nom.charAt(0).toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-900 truncate">{profil.nom}</div>
                  <div className="text-xs text-gray-500">{ROLE_LABELS[profil.role]}</div>
                </div>
                <button onClick={deconnexion}
                  className="flex items-center gap-1.5 px-3 h-9 rounded-xl text-sm font-semibold text-danger hover:bg-red-50 transition-colors">
                  <LogOut size={16} /> Déconnexion
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Barre du bas */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur border-t border-slate-200/70 flex lg:hidden shadow-sticky pb-safe">
        {principaux.map(item => (
          <NavLink key={item.to} to={item.to} end={item.to === "/"} className="flex-1" onClick={() => setDrawerOpen(false)}>
            {({ isActive }) => <Onglet actif={isActive} icone={item.icon(21)} label={item.label} badge={item.badge} />}
          </NavLink>
        ))}
        {autres.length > 0 && (
          <button onClick={() => setDrawerOpen(o => !o)} className="flex-1">
            <Onglet actif={drawerOpen || autreActif} icone={<MoreHorizontal size={21} />} label="Plus" badge={badgeAutres} />
          </button>
        )}
      </nav>
    </>
  );
}

function Onglet({ actif, icone, label, badge = 0 }: { actif: boolean; icone: React.ReactNode; label: string; badge?: number }) {
  return (
    <div className="relative flex flex-col items-center gap-0.5 pt-2 pb-1.5">
      <span className={["flex items-center justify-center w-14 h-8 rounded-full transition-colors",
        actif ? "bg-secondary-50 text-secondary-600" : "text-gray-400"].join(" ")}>
        {icone}
      </span>
      <span className={["text-[11px]", actif ? "text-secondary-700 font-semibold" : "text-gray-500 font-medium"].join(" ")}>{label}</span>
      {badge > 0 && (
        <span className="absolute top-1 left-1/2 ml-2 min-w-[18px] h-[18px] px-1 bg-danger rounded-full text-[10px] font-bold text-white flex items-center justify-center ring-2 ring-white">
          {badge}
        </span>
      )}
    </div>
  );
}
