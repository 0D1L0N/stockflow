import { useEffect, useState } from "react";

/** Champ où l'on tape au clavier (pas une case à cocher ni un bouton). */
const estChampTexte = (el: EventTarget | null) =>
  el instanceof HTMLTextAreaElement
  || (el instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit", "range", "file"].includes(el.type));

/**
 * Vrai pendant la saisie au clavier sur téléphone : on masque alors la barre du bas
 * et les boutons flottants, pour laisser la place aux résultats au-dessus du clavier.
 */
export function useClavierOuvert(): boolean {
  const [ouvert, setOuvert] = useState(false);
  useEffect(() => {
    const entree = (e: FocusEvent) => { if (estChampTexte(e.target)) setOuvert(true); };
    // Le focus passe parfois d'un champ à l'autre : on attend un instant avant de conclure
    const sortie = () => setTimeout(() => setOuvert(estChampTexte(document.activeElement)), 120);
    document.addEventListener("focusin", entree);
    document.addEventListener("focusout", sortie);
    return () => { document.removeEventListener("focusin", entree); document.removeEventListener("focusout", sortie); };
  }, []);
  return ouvert;
}
