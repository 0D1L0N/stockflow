import { useEffect, useState, type ReactNode } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { LogOut, RefreshCw, ShieldOff } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuthStore } from "@/stores/authStore";
import Connexion from "@/pages/Connexion";
import Button from "@/components/ui/Button";
import Logo from "./Logo";
import { forcerMiseAJour } from "@/lib/miseAJour";

/** Compare deux versions "1.2.3". Renvoie < 0 si a < b. */
function comparerVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Met à jour pour de bon (voir forcerMiseAJour), avec un retour visible pendant le téléchargement. */
function BoutonMiseAJour() {
  const [enCours, setEnCours] = useState(false);
  return (
    <Button icon={<RefreshCw size={16} className={enCours ? "animate-spin" : ""} />} disabled={enCours}
      onClick={() => { setEnCours(true); forcerMiseAJour(); }}>
      {enCours ? "Mise à jour en cours…" : "Mettre à jour maintenant"}
    </Button>
  );
}

function EcranMessage({ icon, titre, texte, action }: { icon: ReactNode; titre: string; texte: string; action: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-background flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-modal p-7 max-w-sm w-full text-center flex flex-col items-center gap-3 animate-slide-up">
        <div className="text-primary">{icon}</div>
        <h1 className="font-bold text-gray-800">{titre}</h1>
        <p className="text-sm text-gray-500">{texte}</p>
        {action}
      </div>
    </div>
  );
}

/**
 * Affiche l'écran de connexion tant que l'utilisateur n'est pas connecté
 * avec un profil actif, et bloque les versions trop anciennes de l'app.
 */
export default function AuthGate({ children }: { children: ReactNode }) {
  const { user, profil, chargement, init, deconnexion } = useAuthStore();
  const [versionMin, setVersionMin] = useState<string | null>(null);

  useEffect(() => init(), []);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "config", "app"),
      snap => setVersionMin((snap.data()?.version_min as string) ?? null),
      () => setVersionMin(null));
  }, [user?.uid]);

  if (chargement) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <div className="animate-pulse"><Logo clair={false} taille="lg" /></div>
      </div>
    );
  }

  if (!user) return <Connexion />;

  if (!profil || !profil.actif) {
    return (
      <EcranMessage icon={<ShieldOff size={36} />} titre="Accès non autorisé"
        texte="Ce compte n'est pas (ou plus) autorisé à utiliser StockFlow. Contactez le gérant."
        action={<Button variant="secondary" icon={<LogOut size={16} />} onClick={deconnexion}>Se déconnecter</Button>} />
    );
  }

  if (versionMin && comparerVersions(__APP_VERSION__, versionMin) < 0) {
    return (
      <EcranMessage icon={<RefreshCw size={36} />} titre="Mise à jour requise"
        texte={`Cette version (${__APP_VERSION__}) n'est plus prise en charge. Restez connecté à Internet et touchez le bouton : la nouvelle version s'installe en quelques secondes.`}
        action={<BoutonMiseAJour />} />
    );
  }

  return <>{children}</>;
}
