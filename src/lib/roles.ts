export type Role = "gerant" | "vendeur" | "magasinier";

export const ROLE_LABELS: Record<Role, string> = {
  gerant: "Gérant",
  vendeur: "Vendeur",
  magasinier: "Magasinier",
};

/**
 * Rôles proposés à la création d'un compte. Pour l'instant le vendeur
 * cumule aussi les tâches de magasinier ; le rôle "magasinier" reste
 * reconnu pour les comptes existants mais n'est plus proposé.
 */
export const ROLES_PROPOSES: Role[] = ["gerant", "vendeur"];

// Rôles autorisés par page. Doit rester cohérent avec firestore.rules,
// qui est la vraie barrière de sécurité (ceci ne fait que masquer l'UI).
export const ROUTE_ROLES: Record<string, Role[]> = {
  "/":            ["gerant"],
  "/vente":       ["gerant", "vendeur"],
  "/produits":    ["gerant", "vendeur", "magasinier"],
  "/clients":     ["gerant", "vendeur"],
  "/historique":  ["gerant", "vendeur"],
  "/reappro":     ["gerant", "vendeur", "magasinier"],
  "/fournisseurs": ["gerant", "vendeur"],
  "/casiers":    ["gerant", "vendeur"],
  "/alertes":     ["gerant", "vendeur", "magasinier"],
  "/mouvements":  ["gerant", "vendeur", "magasinier"],
  "/ajustement":  ["gerant", "vendeur", "magasinier"],
  "/parametres":  ["gerant"],
  "/utilisateurs": ["gerant"],
};

export function peutAcceder(role: Role | undefined, route: string): boolean {
  return !!role && (ROUTE_ROLES[route] ?? ["gerant"]).includes(role);
}

/** Page d'accueil selon le rôle. */
export function routeAccueil(role: Role): string {
  return role === "gerant" ? "/" : role === "vendeur" ? "/vente" : "/produits";
}
