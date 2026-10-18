import { useEffect, useRef } from "react";

/**
 * Bouton Retour d'Android : il ferme la fenêtre ouverte (modale, panier, menu)
 * au lieu de quitter la page — ou l'application installée.
 * Chaque fenêtre ouverte ajoute une entrée dans l'historique ; seule celle du dessus se ferme.
 */
const pile: string[] = [];
// Entrées rendues par une fenêtre fermée, reprises si elle se rouvre aussitôt (double montage de React en dev)
const liberees = new Set<string>();

export function useRetourFerme(ouvert: boolean, fermer: () => void) {
  const fermerRef = useRef(fermer);
  fermerRef.current = fermer;

  useEffect(() => {
    if (!ouvert) return;
    let cle: string;
    const actuelle = history.state?.fenetre as string | undefined;
    if (actuelle && liberees.has(actuelle)) { cle = actuelle; liberees.delete(cle); }
    else {
      cle = Math.random().toString(36).slice(2);
      history.pushState({ ...history.state, fenetre: cle }, "");
    }
    pile.push(cle);
    let fermeeParRetour = false;

    const onPop = () => {
      if (pile[pile.length - 1] !== cle) return;     // une autre fenêtre est au-dessus
      if (history.state?.fenetre === cle) return;    // toujours sur notre entrée
      pile.pop();
      fermeeParRetour = true;
      fermerRef.current();
    };
    window.addEventListener("popstate", onPop);

    return () => {
      window.removeEventListener("popstate", onPop);
      const i = pile.lastIndexOf(cle);
      if (i >= 0) pile.splice(i, 1);
      if (fermeeParRetour) return;
      // Fermée par un bouton : on retire l'entrée ajoutée (sauf si on a navigué entre-temps)
      liberees.add(cle);
      setTimeout(() => {
        if (!liberees.delete(cle)) return;
        if (history.state?.fenetre === cle) history.back();
      }, 0);
    };
  }, [ouvert]);
}
