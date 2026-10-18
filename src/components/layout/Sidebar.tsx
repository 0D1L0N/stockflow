import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, ShoppingCart, Package, Users,
  RefreshCw, AlertTriangle, History, TrendingUp, Settings, SlidersHorizontal, LogOut, UserCog,
} from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { peutAcceder, ROLE_LABELS } from "@/lib/roles";
import Logo from "./Logo";

interface NavItem {
  to: string;
  icon: React.ReactNode;
  label: string;
  badgeCount?: number;
}

interface SidebarProps {
  alertCount?: number;
}

export default function Sidebar({ alertCount = 0 }: SidebarProps) {
  const { profil, deconnexion } = useAuthStore();
  const sections: { titre: string; items: NavItem[] }[] = [
    {
      titre: "Ventes",
      items: [
        { to: "/",           icon: <LayoutDashboard size={18} />, label: "Tableau de bord" },
        { to: "/vente",      icon: <ShoppingCart    size={18} />, label: "Nouvelle vente" },
        { to: "/historique", icon: <History         size={18} />, label: "Historique des ventes" },
        { to: "/clients",    icon: <Users           size={18} />, label: "Clients" },
      ],
    },
    {
      titre: "Stock",
      items: [
        { to: "/produits",   icon: <Package           size={18} />, label: "Produits" },
        { to: "/alertes",    icon: <AlertTriangle     size={18} />, label: "Alertes de stock", badgeCount: alertCount },
        { to: "/reappro",    icon: <RefreshCw         size={18} />, label: "Réapprovisionnement" },
        { to: "/ajustement", icon: <SlidersHorizontal size={18} />, label: "Ajustement de stock" },
        { to: "/mouvements", icon: <TrendingUp        size={18} />, label: "Mouvements de stock" },
      ],
    },
    {
      titre: "Administration",
      items: [
        { to: "/utilisateurs", icon: <UserCog  size={18} />, label: "Utilisateurs" },
        { to: "/parametres",   icon: <Settings size={18} />, label: "Paramètres" },
      ],
    },
  ];
  const visibles = sections
    .map(s => ({ ...s, items: s.items.filter(i => peutAcceder(profil?.role, i.to)) }))
    .filter(s => s.items.length > 0);
  const nom = profil?.nom ?? "";

  return (
    <aside className="w-64 bg-gradient-to-b from-primary-700 to-primary-900 flex flex-col h-full flex-shrink-0">
      <div className="px-5 pt-5 pb-4">
        <Logo sousTitre="Gestion de dépôt" />
      </div>

      <nav className="flex-1 px-3 pb-3 flex flex-col gap-4 overflow-y-auto scrollbar-fin">
        {visibles.map(section => (
          <div key={section.titre} className="flex flex-col gap-0.5">
            <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">{section.titre}</div>
            {section.items.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) => [
                  "group flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-150",
                  isActive
                    ? "bg-white/10 text-white font-semibold shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
                    : "text-white/65 hover:bg-white/[0.06] hover:text-white",
                ].join(" ")}
              >
                {({ isActive }) => (
                  <>
                    <span className={isActive ? "text-secondary-400" : "text-white/50 group-hover:text-white/80"}>{item.icon}</span>
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badgeCount !== undefined && item.badgeCount > 0 && (
                      <span className="bg-danger text-white text-[10px] font-bold min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center">
                        {item.badgeCount}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="m-3 p-3 rounded-2xl bg-white/[0.06] flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-secondary-400 to-secondary-600 flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold text-sm">{nom.charAt(0).toUpperCase()}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-white text-sm font-semibold truncate">{nom}</div>
          <div className="text-white/45 text-[11px]">{profil ? ROLE_LABELS[profil.role] : ""}</div>
        </div>
        <button onClick={deconnexion} title="Se déconnecter" aria-label="Se déconnecter"
          className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors">
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}
