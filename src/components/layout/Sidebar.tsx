import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, ShoppingCart, Package, Users,
  RefreshCw, AlertTriangle, History, TrendingUp, Settings, SlidersHorizontal, LogOut, UserCog,
} from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { peutAcceder, ROLE_LABELS } from "@/lib/roles";
import Logo from "./Logo";
import Avatar from "@/components/ui/Avatar";

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
    <aside className="w-64 bg-ink-900 flex flex-col h-full flex-shrink-0 relative overflow-hidden">
      {/* Lueur d'ambiance discrète en haut du menu */}
      <div className="pointer-events-none absolute -top-24 -left-16 w-64 h-64 rounded-full bg-secondary-500/10 blur-3xl" />

      <div className="relative px-5 pt-6 pb-5">
        <Logo sousTitre="Gestion de dépôt" />
      </div>

      <nav className="relative flex-1 px-3 pb-3 flex flex-col gap-5 overflow-y-auto scrollbar-fin">
        {visibles.map(section => (
          <div key={section.titre} className="flex flex-col gap-0.5">
            <div className="px-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-400">{section.titre}</div>
            {section.items.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) => [
                  "group relative flex items-center gap-3 px-3 py-2 rounded-lg text-[13.5px] transition-colors duration-150",
                  isActive ? "bg-white/[0.07] text-white font-semibold" : "text-ink-300 hover:bg-white/[0.04] hover:text-white",
                ].join(" ")}
              >
                {({ isActive }) => (
                  <>
                    {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-secondary-400" />}
                    <span className={isActive ? "text-secondary-400" : "text-ink-400 group-hover:text-ink-300"}>{item.icon}</span>
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badgeCount !== undefined && item.badgeCount > 0 && (
                      <span className="bg-red-500 text-white text-[10px] font-bold min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center">
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

      <div className="relative m-3 p-2.5 rounded-xl bg-white/[0.05] border border-white/[0.06] flex items-center gap-3">
        <Avatar nom={nom || "?"} taille="sm" rond />
        <div className="flex-1 min-w-0">
          <div className="text-white text-[13px] font-semibold truncate">{nom}</div>
          <div className="text-ink-400 text-[11px]">{profil ? ROLE_LABELS[profil.role] : ""}</div>
        </div>
        <button onClick={deconnexion} title="Se déconnecter" aria-label="Se déconnecter"
          className="p-2 rounded-lg text-ink-400 hover:text-white hover:bg-white/10 transition-colors">
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}
