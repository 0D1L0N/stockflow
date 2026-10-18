import { useEffect, useState, type FormEvent } from "react";
import { Mail, Lock, User } from "lucide-react";
import { useAuthStore, messageErreurAuth } from "@/stores/authStore";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth, firebaseConfigure } from "@/lib/firebase";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Logo from "@/components/layout/Logo";

export default function Connexion() {
  const { connexion, proprietaireExiste, creerGerant } = useAuthStore();
  const [mode, setMode] = useState<"connexion" | "installation">("connexion");
  const [installationPossible, setInstallationPossible] = useState(false);
  const [verificationImpossible, setVerificationImpossible] = useState(false);
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreur, setErreur] = useState("");
  const [info, setInfo] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const motDePasseOublie = async () => {
    setErreur(""); setInfo("");
    if (!email.trim()) { setErreur("Saisissez d'abord votre adresse e-mail."); return; }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setInfo(`Un lien pour choisir un nouveau mot de passe a été envoyé à ${email.trim()} (pensez aux spams).`);
    } catch (err) { setErreur(messageErreurAuth(err)); }
  };

  useEffect(() => {
    if (!firebaseConfigure) return;
    proprietaireExiste()
      .then(existe => { setInstallationPossible(!existe); setVerificationImpossible(false); })
      .catch(() => setVerificationImpossible(true));
  }, []);

  const soumettre = async (e: FormEvent) => {
    e.preventDefault();
    setErreur("");
    if (mode === "installation") {
      if (!nom.trim()) { setErreur("Indiquez votre nom."); return; }
      if (motDePasse !== confirmation) { setErreur("Les mots de passe ne correspondent pas."); return; }
    }
    setEnvoi(true);
    try {
      if (mode === "connexion") await connexion(email, motDePasse);
      else await creerGerant(nom, email, motDePasse);
    } catch (err) { setErreur(messageErreurAuth(err)); }
    setEnvoi(false);
  };
  return (
    <div className="min-h-[100dvh] bg-background lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* Panneau de marque (encre) : bandeau en haut sur téléphone, moitié gauche sur ordinateur */}
      <aside className="relative overflow-hidden bg-ink-900 text-white px-6 pt-[calc(2.5rem+env(safe-area-inset-top))] pb-24 lg:pb-10 lg:px-14 lg:py-14 flex flex-col">
        <MotifCasiers />
        <div className="pointer-events-none absolute -bottom-32 -right-24 w-96 h-96 rounded-full bg-secondary-500/20 blur-3xl" />
        <div className="relative"><Logo sousTitre="Gestion de dépôt de boissons" /></div>
        <div className="relative mt-10 lg:mt-auto lg:mb-auto max-w-md">
          <h2 className="text-[28px] lg:text-[42px] font-extrabold leading-[1.08] tracking-[-0.03em]">
            Votre dépôt,<br /><span className="text-secondary-400">sous contrôle.</span>
          </h2>
          <ul className="hidden lg:flex flex-col gap-3 mt-8 text-[15px] text-ink-300">
            {["Ventes, stock et casiers en temps réel", "Dettes clients et casiers à rendre suivis", "Fonctionne même sans connexion"].map(t => (
              <li key={t} className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full bg-secondary-400/15 text-secondary-400 flex items-center justify-center text-xs">✓</span>{t}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative hidden lg:block text-xs text-ink-400">© StockFlow</p>
      </aside>

      <div className="relative -mt-14 lg:mt-0 px-4 pb-10 lg:p-10 flex lg:items-center justify-center">
        <div className="w-full max-w-sm animate-slide-up">
        <form onSubmit={soumettre} className="bg-white rounded-2xl border border-slate-200 shadow-[0_20px_40px_-20px_rgba(11,18,32,0.25)] lg:shadow-none lg:border-0 lg:bg-transparent p-6 sm:p-8 lg:p-0 flex flex-col gap-4">
          <div>
            <h1 className="font-bold text-gray-900 text-xl tracking-tight">
              {mode === "connexion" ? "Connexion" : "Première installation"}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {mode === "connexion" ? "Accédez à votre dépôt avec votre e-mail." : "Ce compte sera le compte gérant, avec tous les droits."}
            </p>
          </div>

          {!firebaseConfigure && (
            <div className="text-xs bg-amber-50 text-amber-800 rounded-xl px-3 py-2">
              Firebase n'est pas configuré : renseignez le fichier <code>.env</code> (voir <code>.env.example</code>).
            </div>
          )}

          {verificationImpossible && mode === "connexion" && (
            <div className="text-xs bg-amber-50 text-amber-800 rounded-xl px-3 py-2">
              Impossible de vérifier si l'application est installée : vérifiez la connexion Internet
              et que les règles Firestore sont publiées (<code>firestore.rules</code>).
            </div>
          )}

          {mode === "installation" && (
            <Input label="Votre nom" value={nom} onChange={e => setNom(e.target.value)}
              icon={<User size={16} />} autoComplete="name" />
          )}
          <Input label="E-mail" type="email" value={email} onChange={e => setEmail(e.target.value)}
            icon={<Mail size={16} />} autoComplete="email" required />
          <Input label="Mot de passe" type="password" value={motDePasse} onChange={e => setMotDePasse(e.target.value)}
            icon={<Lock size={16} />} autoComplete={mode === "connexion" ? "current-password" : "new-password"} required />
          {mode === "installation" && (
            <Input label="Confirmer le mot de passe" type="password" value={confirmation}
              onChange={e => setConfirmation(e.target.value)} icon={<Lock size={16} />} autoComplete="new-password" required />
          )}

          {erreur && <p className="text-sm text-red-700 bg-red-50 rounded-xl px-3 py-2">{erreur}</p>}
          {info && <p className="text-sm text-emerald-800 bg-emerald-50 rounded-xl px-3 py-2">{info}</p>}

          <Button type="submit" loading={envoi} disabled={!firebaseConfigure} className="w-full">
            {mode === "connexion" ? "Se connecter" : "Créer le compte gérant"}
          </Button>

          {mode === "connexion" && firebaseConfigure && (
            <button type="button" onClick={motDePasseOublie}
              className="text-sm text-gray-500 hover:text-primary font-medium transition-colors">
              Mot de passe oublié ?
            </button>
          )}

          {installationPossible && (
            <button type="button" onClick={() => { setMode(mode === "connexion" ? "installation" : "connexion"); setErreur(""); }}
              className="text-sm text-secondary-700 hover:text-secondary-800 font-semibold border-t border-slate-100 pt-4 transition-colors">
              {mode === "connexion" ? "Première installation ? Créer le compte gérant" : "J'ai déjà un compte"}
            </button>
          )}
        </form>
        <p className="text-center text-gray-400 text-xs mt-6 lg:text-left">Fonctionne aussi hors connexion</p>
        </div>
      </div>
    </div>
  );
}

/** Motif décoratif : grille de casiers vus de face, très discrète. */
function MotifCasiers() {
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 w-full h-full opacity-[0.06]" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="casiers" width="64" height="52" patternUnits="userSpaceOnUse">
          <rect x="6" y="6" width="52" height="40" rx="7" fill="none" stroke="white" strokeWidth="1.5" />
          <path d="M6 26h52M23.3 6v40M40.6 6v40" stroke="white" strokeWidth="1.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#casiers)" />
    </svg>
  );
}
