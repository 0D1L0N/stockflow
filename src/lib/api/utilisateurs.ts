import { deleteApp, initializeApp } from "firebase/app";
import { createUserWithEmailAndPassword, inMemoryPersistence, initializeAuth, sendPasswordResetEmail, signOut } from "firebase/auth";
import { doc, setDoc, updateDoc } from "firebase/firestore";
import { auth, config, db } from "@/lib/firebase";
import { roleEffectif, type Role } from "@/lib/roles";
import { messageErreurAuth } from "@/stores/authStore";
import { col, lister, maintenant, parNom, type Commande, type Id } from "./outils";

const ROLES: Role[] = ["admin", "gerant", "magasinier"];

interface Utilisateur { id: Id; nom: string; email: string; role: Role; actif: boolean; date_creation?: string; }

function exigerEnLigne() {
  if (!navigator.onLine) throw new Error("Connexion Internet requise pour gérer les comptes.");
}

function verifierRole(role: unknown): Role {
  if (!ROLES.includes(role as Role)) throw new Error("Rôle inconnu.");
  return role as Role;
}

export const utilisateurs: Record<string, Commande> = {
  // Les anciens comptes « vendeur » s'affichent comme magasiniers
  get_utilisateurs: async () => (await lister<Utilisateur>(col("users")))
    .map(u => ({ ...u, role: roleEffectif(u.role) ?? u.role }))
    .sort(parNom),

  /**
   * Crée le compte de connexion d'un employé puis son profil.
   * Le compte est créé depuis une instance Firebase secondaire, sinon
   * le gérant serait déconnecté et connecté à la place du nouvel employé.
   */
  create_utilisateur: async ({ nom, email, motDePasse, role }) => {
    exigerEnLigne();
    const r = verifierRole(role);
    if (!String(nom ?? "").trim()) throw new Error("Le nom est obligatoire.");

    const secondaire = initializeApp(config, `creation-${Date.now()}`);
    try {
      const authSecondaire = initializeAuth(secondaire, { persistence: inMemoryPersistence });
      let uid: string;
      try {
        uid = (await createUserWithEmailAndPassword(authSecondaire, String(email).trim(), String(motDePasse))).user.uid;
      } catch (e) {
        throw new Error(messageErreurAuth(e));
      }
      await signOut(authSecondaire);
      // Écrit par l'admin (règles : seul un admin crée le profil d'un autre)
      await setDoc(doc(db, "users", uid), {
        nom: String(nom).trim(), email: String(email).trim(), role: r, actif: true, date_creation: maintenant(),
      });
      return uid;
    } finally {
      await deleteApp(secondaire);
    }
  },

  update_utilisateur: async ({ uid, nom, role, actif }) => {
    exigerEnLigne();
    const soiMeme = uid === auth.currentUser?.uid;
    const r = verifierRole(role);
    if (soiMeme && (r !== "admin" || actif === false)) {
      throw new Error("Vous ne pouvez pas retirer vos propres droits d'admin ni désactiver votre compte.");
    }
    await updateDoc(doc(db, "users", uid as Id), { nom: String(nom).trim(), role: r, actif: actif !== false });
  },

  /** Envoie par e-mail un lien pour choisir un nouveau mot de passe. */
  reinitialiser_mot_de_passe: async ({ email }) => {
    exigerEnLigne();
    try { await sendPasswordResetEmail(auth, String(email).trim()); }
    catch (e) { throw new Error(messageErreurAuth(e)); }
  },
};
