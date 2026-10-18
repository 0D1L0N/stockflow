import { useEffect, useState } from "react";
import { CheckCircle, Printer, Download, ShoppingCart, Home, Loader, Share2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { type VenteItem } from "@/stores/venteStore";
import { useAppStore } from "@/stores/appStore";
import { useAuthStore } from "@/stores/authStore";
import { peutAcceder } from "@/lib/roles";
import { FactureHTML } from "@/components/facture/FactureHTML";
import { type FactureData } from "@/components/facture/FacturePDF";
import { invoke } from "@/lib/db";
import { downloadFacture, printFacture, partagerFacture, partageDisponible, construireCompte } from "@/lib/pdf";
import { volumeFr } from "@/lib/format";

interface Parametres {
  nom_commerce: string; adresse_commerce: string | null;
  telephone_commerce: string | null; email_commerce: string | null;
  devise: string; symbole_devise: string; symbole_position: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  venteId: string;
  numeroFacture: string;
  clientNom: string;
  clientTelephone?: string | null;
  items: VenteItem[];
  total: number;
  montantRecu: number;
  monnaieRendue: number | null;
  montantPaye?: number;
  emballagesLivres?: Record<string, number>;
  emballagesRendus?: Record<string, number>;
  /** Soldes du client juste avant la vente (null pour le client de comptoir) */
  soldeAvant?: { argent: number; emballages: Record<string, number> } | null;
  nomEmballage?: (id: string) => string;
  onNouvelleVente: () => void;
}


export default function ModalConfirmationVente({
  isOpen, onClose, numeroFacture, clientNom, clientTelephone,
  items, total, montantRecu, monnaieRendue, onNouvelleVente,
  montantPaye = total, emballagesLivres = {}, emballagesRendus = {}, soldeAvant = null,
  nomEmballage = () => "Casier",
}: Props) {
  const compte = construireCompte(
    { total, montant_paye: montantPaye, emballages_livres: emballagesLivres, emballages_rendus: emballagesRendus, solde_avant: soldeAvant },
    nomEmballage,
  );
  const resteDu = compte?.argent?.nouveau ?? 0;
  // Tout est réglé : plus de dette ni de casier à rendre
  const soldeOk = !!compte && resteDu <= 0 && compte.casiers.every(c => c.apres <= 0);
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.profil?.role);
  const { symbole, position, formatMontant: formatPrix } = useAppStore();
  const [parametres, setParametres] = useState<Parametres | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [showApercu, setShowApercu] = useState(false);

  useEffect(() => {
    if (isOpen && !parametres) {
      invoke<Parametres>("get_parametres").then(setParametres);
    }
  }, [isOpen]);

  const getFactureData = (): FactureData => ({
    numero_facture: numeroFacture,
    date: new Date().toLocaleString("fr-FR", {
      day: "numeric", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    }),
    client: { nom: clientNom, telephone: clientTelephone ?? "", adresse: "" },
    items: items.map(i => ({
      nom_produit: i.nom,
      volume: `${volumeFr(i.volume, i.unite)}`,
      quantite: i.quantite,
      prix_unitaire: i.prix,
      sous_total: i.sous_total,
    })),
    total,
    montant_recu: montantRecu > 0 ? montantRecu : null,
    monnaie_rendue: monnaieRendue,
    commerce: {
      nom: parametres?.nom_commerce ?? "StockFlow",
      adresse: parametres?.adresse_commerce ?? "",
      telephone: parametres?.telephone_commerce ?? "",
      email: parametres?.email_commerce ?? "",
    },
    devise: { symbole, position },
    compte,
  });

  const handleImprimer = async () => {
    setPdfLoading(true);
    setPdfError(null);
    try { await printFacture(getFactureData()); }
    catch (e) { setPdfError(e instanceof Error ? e.message : String(e)); }
    setPdfLoading(false);
  };

  const handleTelecharger = async () => {
    setPdfLoading(true);
    setPdfError(null);
    try { await downloadFacture(getFactureData()); }
    catch (e) { setPdfError(e instanceof Error ? e.message : String(e)); }
    setPdfLoading(false);
  };

  const handlePartager = async () => {
    setPdfLoading(true);
    setPdfError(null);
    try { await partagerFacture(getFactureData()); }
    catch (e) { setPdfError(e instanceof Error ? e.message : String(e)); }
    setPdfLoading(false);
  };

  const peutPartager = partageDisponible();

  const handleNouvelleVente = () => {
    onNouvelleVente();
    navigate("/vente");
  };

  const handleDashboard = () => {
    onClose();
    navigate("/");
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      <div className="p-6 flex flex-col gap-4">
        {/* Icône animée + titre */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center animate-[scaleIn_0.5s_cubic-bezier(0.34,1.56,0.64,1)_both]">
            <CheckCircle size={36} className="text-secondary" strokeWidth={1.8} />
          </div>
          <div>
            <h2 className="font-extrabold text-xl text-gray-800">Vente enregistrée !</h2>
            <p className="text-gray-500 text-sm mt-0.5">La vente a été créée avec succès.</p>
          </div>
        </div>

        {/* Récap financier */}
        <div className="bg-slate-50 rounded-xl p-4 flex flex-col gap-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">N° de facture</span>
            <span className="font-mono font-bold text-primary">{numeroFacture}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Client</span>
            <span className="font-semibold text-gray-800">{clientNom}</span>
          </div>

          {items.length > 0 && (
            <div className="border-t border-slate-200 pt-2 mt-1 flex flex-col gap-1">
              {items.map(item => (
                <div key={item.format_id} className="flex justify-between text-xs">
                  <span className="text-gray-600 truncate max-w-[60%]">
                    {item.nom} {volumeFr(item.volume, item.unite)} × {item.quantite}
                  </span>
                  <span className="font-semibold text-gray-700">{formatPrix(item.sous_total)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-between border-t border-slate-200 pt-2 mt-1">
            <span className="font-bold text-gray-800">{compte ? "Total facture" : "Total encaissé"}</span>
            <span className="font-extrabold text-lg text-primary">{formatPrix(total)}</span>
          </div>
          {montantRecu > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-500">Montant reçu</span>
              <span className="font-semibold">{formatPrix(montantRecu)}</span>
            </div>
          )}
          {monnaieRendue !== null && monnaieRendue > 0 && (
            <div className="flex justify-between bg-green-50 rounded-lg px-3 py-2 -mx-1">
              <span className="text-green-700 font-medium">Monnaie à rendre</span>
              <span className="font-extrabold text-secondary">{formatPrix(monnaieRendue)}</span>
            </div>
          )}
          {compte && (
            <div className={["flex flex-col gap-1.5 rounded-xl px-3 py-2.5 -mx-1 text-xs",
              soldeOk ? "bg-emerald-50 text-emerald-900" : "bg-orange-50 text-orange-900"].join(" ")}>
              {compte.argent && (
                <>
                  {compte.argent.ancien !== 0 && (
                    <div className="flex justify-between"><span>Ancien solde dû</span><span>{formatPrix(compte.argent.ancien)}</span></div>
                  )}
                  <div className="flex justify-between"><span>Payé</span><span>{formatPrix(compte.argent.paye)}</span></div>
                  <div className="flex justify-between font-bold">
                    <span>{compte.argent.nouveau > 0 ? "Reste dû" : compte.argent.nouveau < 0 ? "Avoir du client" : "Argent"}</span>
                    <span>{compte.argent.nouveau === 0 ? "réglé ✓" : formatPrix(Math.abs(compte.argent.nouveau))}</span>
                  </div>
                </>
              )}
              {compte.casiers.map((c, i) => (
                <div key={i} className={compte.argent || i > 0 ? "pt-1.5 border-t border-black/5" : ""}>
                  <div className="flex justify-between gap-2 font-bold">
                    <span className="min-w-0">{c.nom}</span>
                    <span className="whitespace-nowrap">{c.apres > 0 ? `doit ${c.apres}` : "réglé ✓"}</span>
                  </div>
                  <div className="opacity-75">
                    {[c.avant ? `dû avant : ${c.avant}` : null,
                      c.livres ? `${c.livres} livré${c.livres > 1 ? "s" : ""}` : null,
                      `${c.rendus} rendu${c.rendus > 1 ? "s" : ""}`].filter(Boolean).join(" · ")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Aperçu facture (toggle) */}
        <button
          onClick={() => setShowApercu(p => !p)}
          className="text-xs text-secondary font-semibold flex items-center justify-center gap-1 hover:underline"
        >
          {showApercu ? "Masquer l'aperçu" : "Voir l'aperçu de la facture"}
        </button>

        {showApercu && (
          <div className="border border-slate-200 rounded-xl overflow-y-auto max-h-72">
            <FactureHTML data={getFactureData()} />
          </div>
        )}

        {/* Erreur PDF */}
        {pdfError && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
            ⚠️ {pdfError}
          </div>
        )}

        {/* Actions PDF */}
        <div className="flex flex-col gap-2">
          {peutPartager && (
            <Button
              icon={pdfLoading ? <Loader size={14} className="animate-spin" /> : <Share2 size={14} />}
              onClick={handlePartager}
              disabled={pdfLoading}
              className="w-full justify-center bg-primary hover:bg-primary/90"
            >
              Partager la facture (WhatsApp…)
            </Button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              icon={pdfLoading ? <Loader size={14} className="animate-spin" /> : <Printer size={14} />}
              onClick={handleImprimer}
              disabled={pdfLoading}
              size="sm"
            >
              Imprimer
            </Button>
            <Button
              variant="secondary"
              icon={pdfLoading ? <Loader size={14} className="animate-spin" /> : <Download size={14} />}
              onClick={handleTelecharger}
              disabled={pdfLoading}
              size="sm"
            >
              Télécharger
            </Button>
          </div>
          <Button icon={<ShoppingCart size={15} />} className="w-full justify-center" onClick={handleNouvelleVente}>
            Nouvelle vente
          </Button>
          {peutAcceder(role, "/") && (
            <button onClick={handleDashboard}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors flex items-center justify-center gap-1.5 mt-1">
              <Home size={13} /> Retour au tableau de bord
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
