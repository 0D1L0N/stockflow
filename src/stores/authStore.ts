import { create } from "zustand";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword, type User } from "firebase/auth";
import { doc, getDoc, onSnapshot, writeBatch, type Unsubscribe } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { roleEffectif, type Role } from "@/lib/roles";

export interface Profil {
  uid: string;
  nom: string;
  email: string;
  role: Role;
  actif: boolean;
}

interface AuthStore {
  user: User | null;
  profil: Profil | null;
  /** true tant que l'état de connexion initial n'est pas connu */
  chargement: boolean;
  init: () => Unsubscribe;
  connexion: (email: string, motDePasse: string) => Promise<void>;
  deconnexion: () => Promise<void>;
  proprietaireExiste: () => Promise<boolean>;
  creerGerant: (nom: string, email: string, motDePasse: string) => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  profil: null,
  chargement: true,

  init: () => {
    let stopProfil: Unsubscribe | null = null;
    const stopAuth = onAuthStateChanged(auth, (user) => {
      stopProfil?.();
      stopProfil = null;
      if (!user) { set({ user: null, profil: null, chargement: false }); return; }
      set({ user, chargement: true });
      // Le profil (rôle, actif) est suivi en direct : un gérant peut
      // désactiver un compte ou changer son rôle à tout moment.
      stopProfil = onSnapshot(
        doc(db, "users", user.uid),
        (snap) => set({
          profil: snap.exists() ? ({ uid: user.uid, ...snap.data(), role: roleEffectif(snap.data().role) } as Profil) : null,
          chargement: false,
        }),
        () => set({ profil: null, chargement: false }),
      );
    });
    return () => { stopProfil?.(); stopAuth(); };
  },

  connexion: async (email, motDePasse) => {
    await signInWithEmailAndPassword(auth, email.trim(), motDePasse);
  },

  deconnexion: async () => {
    // Le panier en cours ne passe pas au compte suivant sur le même téléphone
    try { localStorage.removeItem("stockflow.panier"); } catch { /* stockage indisponible */ }
    await signOut(auth);
    location.reload();
  },

  proprietaireExiste: async () => {
    const snap = await getDoc(doc(db, "config", "proprietaire"));
    return snap.exists();
  },

  // Première installation : le premier compte créé devient gérant.
  // Les règles Firestore n'autorisent cela qu'une seule fois.
  creerGerant: async (nom, email, motDePasse) => {
    const { user } = await createUserWithEmailAndPassword(auth, email.trim(), motDePasse);
    const batch = writeBatch(db);
    batch.set(doc(db, "users", user.uid), { nom: nom.trim(), email: email.trim(), role: "admin", actif: true });
    batch.set(doc(db, "config", "proprietaire"), { uid: user.uid });
    await batch.commit();
  },
}));

/** Traduit les erreurs Firebase Auth en messages lisibles. */
export function messageErreurAuth(e: unknown): string {
  const code = (e as { code?: string })?.code ?? "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":    return "E-mail ou mot de passe incorrect.";
    case "auth/invalid-email":     return "Adresse e-mail invalide.";
    case "auth/email-already-in-use": return "Cette adresse e-mail est déjà utilisée.";
    case "auth/weak-password":     return "Mot de passe trop faible (6 caractères minimum).";
    case "auth/too-many-requests": return "Trop de tentatives. Réessayez dans quelques minutes.";
    case "auth/network-request-failed": return "Pas de connexion Internet.";
    default: return String((e as Error)?.message ?? e);
  }
}
