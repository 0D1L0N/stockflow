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
    <div className="relative min-h-[100dvh] overflow-hidden bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 flex items-center justify-center p-4">
      {/* Halos décoratifs */}
      <div className="absolute -top-32 -right-24 w-80 h-80 rounded-full bg-secondary/20 blur-3xl" />
      <div className="absolute -bottom-40 -left-24 w-96 h-96 rounded-full bg-primary-400/20 blur-3xl" />

      <div className="relative w-full max-w-sm animate-slide-up">
        <div className="flex justify-center mb-8">
          <Logo taille="lg" sousTitre="Ventes, stock et casiers de votre dépôt" />
        </div>

        <form onSubmit={soumettre} className="bg-white rounded-3xl shadow-modal p-6 sm:p-7 flex flex-col gap-4">
          <div>
            <h1 className="font-extrabold text-gray-900 text-xl tracking-tight">
              {mode === "connexion" ? "Bon retour 👋" : "Première installation"}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {mode === "connexion" ? "Connectez-vous pour continuer." : "Ce compte sera le compte gérant, avec tous les droits."}
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
        <p className="text-center text-white/35 text-xs mt-6">Fonctionne aussi hors connexion</p>
      </div>
    </div>
  );
}
