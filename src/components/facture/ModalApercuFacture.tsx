import { useEffect, useState } from "react";
import { Check, Pencil, Eye } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { invoke } from "@/lib/db";
import { FactureHTML } from "@/components/facture/FactureHTML";
import type { FactureData } from "@/components/facture/FacturePDF";

interface Parametres {
  nom_commerce: string; adresse_commerce: string | null;
  telephone_commerce: string | null; email_commerce: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Facture telle qu'elle sera enregistrée, sans numéro ni coordonnées du commerce */
  data: Omit<FactureData, "commerce" | "numero_facture">;
  onValider: () => void;
  validating?: boolean;
}

/**
 * Aperçu de la facture avant d'enregistrer la vente : mêmes chiffres que la vraie facture,
 * marquée « non enregistrée », sans numéro et sans partage (le numéro n'existe qu'à la validation).
 */
export default function ModalApercuFacture({ isOpen, onClose, data, onValider, validating }: Props) {
  const [parametres, setParametres] = useState<Parametres | null>(null);

  useEffect(() => {
    if (isOpen && !parametres) invoke<Parametres>("get_parametres").then(setParametres).catch(() => {});
  }, [isOpen]);

  const facture: FactureData = {
    ...data,
    numero_facture: "attribué à la validation",
    commerce: {
      nom: parametres?.nom_commerce ?? "StockFlow",
      adresse: parametres?.adresse_commerce ?? "",
      telephone: parametres?.telephone_commerce ?? "",
      email: parametres?.email_commerce ?? "",
    },
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Aperçu de la facture" size="lg">
      <div className="flex flex-col">
        <div className="mx-4 mt-4 flex items-start gap-2.5 rounded-xl bg-amber-50 text-amber-900 px-3 py-2.5 text-sm">
          <Eye size={17} className="flex-shrink-0 mt-0.5" />
          <span><b>Aperçu, vente non enregistrée.</b> Montrez-le au client ; le numéro de facture sera attribué à la validation.</span>
        </div>

        <div className="relative m-4 rounded-xl border border-slate-200 overflow-hidden">
          <FactureHTML data={facture} apercu />
          {/* Filigrane : impossible de confondre l'aperçu avec une vraie facture */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden" aria-hidden>
            <span className="-rotate-[24deg] text-[44px] sm:text-[64px] font-black tracking-widest text-amber-500/20 whitespace-nowrap select-none">
              APERÇU
            </span>
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-slate-100 p-4 grid grid-cols-2 gap-2">
          <button onClick={onClose}
            className="h-12 rounded-lg border border-slate-300 font-semibold text-gray-700 flex items-center justify-center gap-2 hover:bg-slate-50">
            <Pencil size={15} /> Modifier
          </button>
          <button onClick={onValider} disabled={validating}
            className="h-12 rounded-lg bg-secondary-600 text-white font-semibold flex items-center justify-center gap-2 hover:bg-secondary-700 disabled:opacity-60">
            <Check size={16} strokeWidth={2.5} /> {validating ? "Validation…" : "Valider la vente"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
