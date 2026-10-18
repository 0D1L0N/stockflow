import { collection, getDocs, type DocumentData, type Query, type QueryDocumentSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

/** Identifiant de document Firestore. */
export type Id = string;

export type Commande = (args: Record<string, unknown>) => Promise<unknown>;

export const col = (nom: string) => collection(db, nom);

/** Document Firestore → objet avec son id, au format attendu par les pages. */
export function avecId<T>(d: QueryDocumentSnapshot<DocumentData>): T {
  return { id: d.id, ...d.data() } as T;
}

export async function lister<T>(q: Query<DocumentData>): Promise<T[]> {
  return (await getDocs(q)).docs.map(d => avecId<T>(d));
}

/** Date locale au format "AAAA-MM-JJ HH:MM:SS", comme l'ancienne base SQLite. */
export function maintenant(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export const parNom = <T extends { nom: string }>(a: T, b: T) =>
  a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" });

/**
 * Hors ligne, une écriture Firestore est appliquée au cache local tout de suite,
 * mais sa promesse ne se résout qu'à la confirmation du serveur.
 * On n'attend donc la confirmation que quelques secondes : au-delà, l'écriture
 * reste en file d'attente et sera envoyée au retour du réseau.
 */
export async function ecrire<T>(promesse: Promise<T>, delaiMs = 4000): Promise<void> {
  promesse.catch(e => console.error("Écriture Firestore refusée :", e));
  if (!navigator.onLine) return;
  await Promise.race([promesse, new Promise(r => setTimeout(r, delaiMs))]);
}

/** Message d'erreur lisible pour les refus des règles de sécurité. */
export function traduireErreur(e: unknown): Error {
  const code = (e as { code?: string })?.code;
  if (code === "permission-denied") return new Error("Action non autorisée pour votre rôle.");
  return e instanceof Error ? e : new Error(String(e));
}
