import { useEffect, type ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ToastProvider } from "@/components/ui/Toast";
import Layout from "@/components/layout/Layout";
import AuthGate from "@/components/layout/AuthGate";
import Dashboard from "@/pages/Dashboard";
import Vente from "@/pages/Vente";
import Produits from "@/pages/Produits";
import Clients from "@/pages/Clients";
import HistoriqueVentes from "@/pages/HistoriqueVentes";
import Reappro from "@/pages/Reappro";
import Alertes from "@/pages/Alertes";
import Mouvements from "@/pages/Mouvements";
import Parametres from "@/pages/Parametres";
import AjustementStock from "@/pages/AjustementStock";
import Utilisateurs from "@/pages/Utilisateurs";
import Fournisseurs from "@/pages/Fournisseurs";
import { useAppStore } from "@/stores/appStore";
import { useAuthStore } from "@/stores/authStore";
import { peutAcceder, routeAccueil } from "@/lib/roles";
import { invoke } from "@/lib/db";

/** Redirige vers la page d'accueil du rôle si la page n'est pas autorisée. */
function Protege({ route, children }: { route: string; children: ReactNode }) {
  const role = useAuthStore((s) => s.profil!.role);
  return peutAcceder(role, route) ? <>{children}</> : <Navigate to={routeAccueil(role)} replace />;
}

const ROUTES: { path: string; element: ReactNode }[] = [
  { path: "/",           element: <Dashboard /> },
  { path: "/vente",      element: <Vente /> },
  { path: "/produits",   element: <Produits /> },
  { path: "/clients",    element: <Clients /> },
  { path: "/historique", element: <HistoriqueVentes /> },
  { path: "/reappro",    element: <Reappro /> },
  { path: "/fournisseurs", element: <Fournisseurs /> },
  { path: "/alertes",    element: <Alertes /> },
  { path: "/mouvements", element: <Mouvements /> },
  { path: "/parametres", element: <Parametres /> },
  { path: "/utilisateurs", element: <Utilisateurs /> },
  { path: "/ajustement", element: <AjustementStock /> },
];

function AppRoutes() {
  const loadAlertes = useAppStore((s) => s.loadAlertes);
  const setDevise = useAppStore((s) => s.setDevise);

  useEffect(() => {
    loadAlertes().catch(() => {});
    invoke<{ devise: string; symbole_devise: string; symbole_position: string }>("get_parametres")
      .then(p => setDevise(p.devise, p.symbole_devise, p.symbole_position as "before" | "after"))
      .catch(() => {});
  }, []);

  return (
    <Layout>
      <Routes>
        {ROUTES.map(r => (
          <Route key={r.path} path={r.path} element={<Protege route={r.path}>{r.element}</Protege>} />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthGate>
          <AppRoutes />
        </AuthGate>
      </ToastProvider>
    </BrowserRouter>
  );
}
