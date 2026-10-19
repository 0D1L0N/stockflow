import { useAuthStore } from "@/stores/authStore";
import { peut, type Privilege } from "@/lib/roles";

/** Le compte connecté a-t-il ce privilège ? (pour afficher ou masquer un bouton) */
export const usePeut = (privilege: Privilege) => useAuthStore((s) => peut(s.profil?.role, privilege));

/** Même question hors d'un composant (dans l'accès aux données). */
export const peutMaintenant = (privilege: Privilege) => peut(useAuthStore.getState().profil?.role, privilege);
