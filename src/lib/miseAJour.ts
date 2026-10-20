import { registerSW } from "virtual:pwa-register";

const TRENTE_MINUTES = 30 * 60 * 1000;

/** Aucune fenêtre, panier ni menu ouvert : une mise à jour (qui recharge la page) ne gêne personne. */
const moment_calme = () => !document.querySelector(".animate-slide-up, .fixed.inset-0");

/**
 * Chaque appareil vérifie lui-même s'il existe une nouvelle version : au retour sur l'application
 * et toutes les 30 minutes quand rien n'est en cours. Sans cela, un téléphone qui garde StockFlow
 * ouvert des jours entiers resterait sur une ancienne version (articles retirés encore visibles…).
 * La nouvelle version s'active d'elle-même et la page se recharge ; le panier en cours est gardé.
 */
export function surveillerMisesAJour() {
  if (import.meta.env.DEV) return;
  registerSW({
    immediate: true,
    onRegisteredSW(_url, enregistrement) {
      if (!enregistrement) return;
      const verifier = () => { if (navigator.onLine) enregistrement.update().catch(() => {}); };
      setInterval(() => { if (moment_calme()) verifier(); }, TRENTE_MINUTES);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && moment_calme()) verifier();
      });
    },
  });
}

/**
 * « Recharger » de l'écran Mise à jour requise : on va chercher la nouvelle version,
 * on jette l'ancienne copie gardée pour le hors-ligne, puis on recharge.
 * Les données saisies hors ligne (base locale Firestore) ne sont pas touchées.
 */
export async function forcerMiseAJour(): Promise<void> {
  try {
    const enregistrements = await navigator.serviceWorker?.getRegistrations?.() ?? [];
    await Promise.all(enregistrements.map(e => e.update().catch(() => {})));
    await Promise.all(enregistrements.map(e => e.unregister().catch(() => false)));
    if ("caches" in window) {
      const cles = await caches.keys();
      await Promise.all(cles.map(c => caches.delete(c)));
    }
  } catch { /* on recharge quand même */ }
  // Paramètre unique : passe outre une page d'accueil gardée en cache par le navigateur
  const url = new URL(location.href);
  url.searchParams.set("maj", String(Date.now()));
  location.replace(url.toString());
}
