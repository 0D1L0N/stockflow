import { commandes } from "@/lib/api";

/**
 * Point d'entrée unique des pages vers les données.
 * Chaque commande est servie par Firestore (src/lib/api).
 */
export async function invoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  const handler = commandes[command];
  if (!handler) throw `Commande inconnue : ${command}`;
  return (await handler(args)) as T;
}
