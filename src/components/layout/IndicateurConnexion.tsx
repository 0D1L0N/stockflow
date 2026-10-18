import { CloudOff, RefreshCw } from "lucide-react";
import { useSyncStore } from "@/lib/tempsReel";

/**
 * Bandeau discret : hors ligne (les ventes restent enregistrées sur l'appareil)
 * ou envoi en cours des opérations faites hors ligne. Rien quand tout est à jour.
 */
export default function IndicateurConnexion() {
  const { enLigne, enAttente } = useSyncStore();
  if (enLigne && enAttente === 0) return null;
  const n = enAttente > 0 ? ` · ${enAttente} opération${enAttente > 1 ? "s" : ""} en attente` : "";

  return (
    <div role="status" className={[
      "flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-semibold flex-shrink-0 pt-[calc(0.375rem+env(safe-area-inset-top))]",
      enLigne ? "bg-sky-50 text-sky-800" : "bg-amber-100 text-amber-900",
    ].join(" ")}>
      {enLigne
        ? <><RefreshCw size={13} className="animate-spin" /> Envoi des données{n}</>
        : <><CloudOff size={13} /> Hors connexion : tout reste enregistré sur cet appareil{n}</>}
    </div>
  );
}
