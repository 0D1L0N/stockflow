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
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col h-full flex-shrink-0">
      <div className="px-5 pt-5 pb-4">
        <Logo clair={false} sousTitre="Gestion de dépôt" />
      </div>

      <nav className="flex-1 px-3 pb-3 flex flex-col gap-4 overflow-y-auto scrollbar-fin">
        {visibles.map(section => (
          <div key={section.titre} className="flex flex-col gap-0.5">
            <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{section.titre}</div>
            {section.items.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) => [
                  "group flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-150",
                  isActive
                    ? "bg-slate-100 text-gray-900 font-semibold"
                    : "text-gray-600 hover:bg-slate-50 hover:text-gray-900",
                ].join(" ")}
              >
                {({ isActive }) => (
                  <>
                    <span className={isActive ? "text-secondary-600" : "text-gray-400 group-hover:text-gray-600"}>{item.icon}</span>
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

      <div className="m-3 p-2.5 rounded-xl border border-slate-200 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-secondary-400 to-secondary-600 flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold text-sm">{nom.charAt(0).toUpperCase()}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-gray-900 text-sm font-semibold truncate">{nom}</div>
          <div className="text-gray-500 text-[11px]">{profil ? ROLE_LABELS[profil.role] : ""}</div>
        </div>
        <button onClick={deconnexion} title="Se déconnecter" aria-label="Se déconnecter"
          className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-slate-100 transition-colors">
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}
