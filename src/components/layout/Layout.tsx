import { type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";
import { useAppStore } from "@/stores/appStore";
import { useAuthStore } from "@/stores/authStore";
import { peutAcceder } from "@/lib/roles";
import { useTempsReel } from "@/lib/tempsReel";
import IndicateurConnexion from "./IndicateurConnexion";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const nombreAlertes = useAppStore((s) => s.nombreAlertes);
  const role = useAuthStore((s) => s.profil?.role);
  // Raccourci « nouvelle vente » seulement sur les pages de consultation :
  // ailleurs (formulaires, paramètres) il masquerait des champs
  // Badge d'alertes à jour quand un autre appareil vend ou réapprovisionne
  const loadAlertes = useAppStore((s) => s.loadAlertes);
  useTempsReel(["stock"], () => { loadAlertes().catch(() => {}); });

  const showFab = ["/clients", "/historique", "/produits"].includes(pathname) && peutAcceder(role, "/vente");

  return (
    // 100dvh : la hauteur réelle visible sur mobile (barres du navigateur exclues)
    <div className="flex h-[100dvh] bg-background overflow-hidden">
      <div className="hidden lg:flex">
        <Sidebar alertCount={nombreAlertes} />
      </div>

      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        <IndicateurConnexion />
        {children}
      </main>

      <BottomNav />

      {/* Bouton flottant : nouvelle vente */}
      {showFab && (
        <button
          onClick={() => navigate("/vente")}
          className="fixed z-20 right-4 bottom-[calc(88px+env(safe-area-inset-bottom))] lg:bottom-6 lg:right-6 h-14 w-14 lg:w-auto lg:px-5 lg:gap-2
            bg-gradient-to-br from-secondary-400 to-secondary-600 text-white rounded-full shadow-glow
            flex items-center justify-center font-semibold transition-all hover:scale-105 active:scale-95"
          title="Nouvelle vente"
          aria-label="Nouvelle vente"
        >
          <Plus size={24} strokeWidth={2.5} />
          <span className="hidden lg:inline">Nouvelle vente</span>
        </button>
      )}
    </div>
  );
}
