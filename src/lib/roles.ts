/**
 * Rôles et privilèges. Doit rester cohérent avec firestore.rules, qui est la vraie
 * barrière de sécurité : ici on ne fait que montrer ou masquer l'interface.
 *
 * - admin      : tout (comptes, paramètres, sauvegardes, annulations, suppressions)
 * - gerant     : ventes, clients, prix, catalogue, stock, fournisseurs, tableau de bord
 * - magasinier : ventes (sans toucher aux prix), stock, réceptions et commandes fournisseurs
 */
export type Role = "admin" | "gerant" | "magasinier";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  gerant: "Gérant",
  magasinier: "Magasinier",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: "Tout : comptes, paramètres, annulations et suppressions",
  gerant: "Ventes, clients, prix, catalogue, stock et fournisseurs",
  magasinier: "Ventes au prix affiché, stock, réceptions et commandes",
};

/** Rôles proposés à la création d'un compte. */
export const ROLES_PROPOSES: Role[] = ["magasinier", "gerant", "admin"];

/**
 * Rôle stocké → rôle de l'application. Les anciens comptes « vendeur » sont des
 * magasiniers ; un compte inconnu n'a aucun droit.
 */
export function roleEffectif(role: string | null | undefined): Role | undefined {
  if (role === "admin" || role === "gerant" || role === "magasinier") return role;
  if (role === "vendeur") return "magasinier";
  return undefined;
}

export type Privilege =
  | "tableau_de_bord"
  | "vendre"
  | "toutes_les_ventes"     // voir les ventes de tout le monde (sinon les siennes)
  | "clients"               // créer et modifier les clients, encaisser leurs dettes
  | "prix"                  // prix comptoir, groupes de prix, prix par client, prix au panier
  | "catalogue"             // créer et modifier produits et formats
  | "stock"                 // réceptions, commandes, comptage, ajustements, casse
  | "fournisseurs_gerer"    // modifier les fiches fournisseurs, payer un fournisseur
  | "annuler"               // annuler une vente
  | "supprimer"             // supprimer clients, produits, formats, fournisseurs, groupes
  | "utilisateurs"
  | "parametres";

const PRIVILEGES: Record<Role, Privilege[]> = {
  admin: ["tableau_de_bord", "vendre", "toutes_les_ventes", "clients", "prix", "catalogue", "stock",
    "fournisseurs_gerer", "annuler", "supprimer", "utilisateurs", "parametres"],
  gerant: ["tableau_de_bord", "vendre", "toutes_les_ventes", "clients", "prix", "catalogue", "stock", "fournisseurs_gerer"],
  magasinier: ["vendre", "stock"],
};

export function peut(role: Role | undefined, privilege: Privilege): boolean {
  return !!role && PRIVILEGES[role].includes(privilege);
}

const TOUS: Role[] = ["admin", "gerant", "magasinier"];
const RESPONSABLES: Role[] = ["admin", "gerant"];

// Pages autorisées par rôle (le contenu de chaque page s'adapte ensuite aux privilèges)
export const ROUTE_ROLES: Record<string, Role[]> = {
  "/":             RESPONSABLES,
  "/vente":        TOUS,
  "/produits":     TOUS,
  "/clients":      RESPONSABLES,
  "/historique":   TOUS,
  "/livraisons":   TOUS,
  "/reappro":      TOUS,
  "/fournisseurs": TOUS,
  "/casiers":      TOUS,
  "/alertes":      TOUS,
  "/mouvements":   TOUS,
  "/ajustement":   TOUS,
  "/journal":      RESPONSABLES,
  "/parametres":   ["admin"],
  "/utilisateurs": ["admin"],
};

export function peutAcceder(role: Role | undefined, route: string): boolean {
  return !!role && (ROUTE_ROLES[route] ?? ["admin"]).includes(role);
}

/** Page d'accueil selon le rôle. */
export function routeAccueil(role: Role): string {
  return role === "magasinier" ? "/vente" : "/";
}
