import { useEffect, useState } from "react";
import { Send, FileDown, Share2, Copy, Loader } from "lucide-react";
import { invoke } from "@/lib/db";
import { useToast } from "@/components/ui/Toast";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import type { BonCommandeData } from "@/components/stock/BonCommandePDF";
import {
  genererBonCommandePDF, texteBonCommande, telechargerBlob, partagerBlob, partageDisponible,
} from "@/lib/pdf";

interface Format { id: string; volume: number; unite: string; stock: number; seuil_alerte: number; emballage_id?: string | null; }
interface Ligne { formatId: string; produit: string; format: string; emballage: string | null; stock: number; seuil: number; enAlerte: boolean; }

const CLE_FOURNISSEUR = "stockflow.fournisseur";

function lireFournisseur(): { nom: string; whatsapp: string } {
  try { return JSON.parse(localStorage.getItem(CLE_FOURNISSEUR) ?? "") ?? { nom: "", whatsapp: "" }; }
  catch { return { nom: "", whatsapp: "" }; }
}

function maintenantLisible() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    numero: `BC-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`,
    date: d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }),
  };
}

/** Bon de commande fournisseur : quantités en casiers, envoi WhatsApp ou PDF. */
export default function ModalBonCommande({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [quantites, setQuantites] = useState<Record<string, string>>({});
  const [toutAfficher, setToutAfficher] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fournisseur, setFournisseur] = useState(lireFournisseur);
  const [note, setNote] = useState("Merci de confirmer la date de livraison.");
  const [commerce, setCommerce] = useState({ nom: "Mon Dépôt", adresse: "", telephone: "" });
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    (async () => {
      const [produits, emballages, params] = await Promise.all([
        invoke<{ id: string; nom: string }[]>("get_produits"),
        invoke<{ id: string; nom: string }[]>("get_emballages").catch(() => []),
        invoke<{ nom_commerce: string; adresse_commerce: string | null; telephone_commerce: string | null }>("get_parametres"),
      ]);
      setCommerce({ nom: params.nom_commerce, adresse: params.adresse_commerce ?? "", telephone: params.telephone_commerce ?? "" });
      const details = await Promise.all(produits.map(p => invoke<{ formats: Format[] }>("get_produit", { id: p.id })));
      const toutes: Ligne[] = produits.flatMap((p, i) => details[i].formats.map(f => ({
        formatId: f.id, produit: p.nom, format: `${f.volume.toLocaleString("fr-FR")} ${f.unite}`,
        emballage: emballages.find(e => e.id === f.emballage_id)?.nom ?? null,
        stock: f.stock, seuil: f.seuil_alerte, enAlerte: f.stock <= f.seuil_alerte,
      })));
      setLignes(toutes);
      // Suggestion : remonter le stock à deux fois le seuil, pour ne pas retomber aussitôt en alerte
      setQuantites(Object.fromEntries(toutes.filter(l => l.enAlerte).map(l => [l.formatId, String(Math.max(1, l.seuil * 2 - l.stock))])));
      setToutAfficher(!toutes.some(l => l.enAlerte));
    })().catch(e => toast(String(e), "error")).finally(() => setLoading(false));
  }, [isOpen]);

  const visibles = toutAfficher ? lignes : lignes.filter(l => l.enAlerte || (parseInt(quantites[l.formatId]) || 0) > 0);
  const commandees = lignes.filter(l => (parseInt(quantites[l.formatId]) || 0) > 0);
  const totalCasiers = commandees.reduce((t, l) => t + parseInt(quantites[l.formatId]), 0);

  const donnees = (): BonCommandeData => ({
    ...maintenantLisible(),
    commerce,
    fournisseur: fournisseur.nom.trim(),
    note: note.trim(),
    lignes: commandees.map(l => ({ produit: l.produit, format: l.format, emballage: l.emballage, quantite: parseInt(quantites[l.formatId]) })),
  });

  const memoriserFournisseur = () => {
    try { localStorage.setItem(CLE_FOURNISSEUR, JSON.stringify(fournisseur)); } catch { /* stockage indisponible */ }
  };

  const verifier = () => {
    if (commandees.length === 0) { toast("Indiquez au moins une quantité", "warning"); return false; }
    memoriserFournisseur();
    return true;
  };

  const envoyerWhatsApp = () => {
    if (!verifier()) return;
    // Numéro international sans + ni espaces (ex. 22997000000) ; sans numéro, WhatsApp demande le contact
    const numero = fournisseur.whatsapp.replace(/\D/g, "");
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(texteBonCommande(donnees()))}`, "_blank");
  };

  const pdf = async (mode: "partager" | "telecharger") => {
    if (!verifier()) return;
    setEnvoi(true);
    try {
      const d = donnees();
      const blob = await genererBonCommandePDF(d);
      if (mode === "partager") await partagerBlob(blob, `${d.numero}.pdf`, `Bon de commande ${d.numero}`);
      else telechargerBlob(blob, `${d.numero}.pdf`);
    } catch (e) { toast(e instanceof Error ? e.message : String(e), "error"); }
    setEnvoi(false);
  };

  const copier = async () => {
    if (!verifier()) return;
    try { await navigator.clipboard.writeText(texteBonCommande(donnees())); toast("Texte copié", "success"); }
    catch { toast("Copie impossible sur cet appareil", "error"); }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Bon de commande fournisseur" size="lg">
      <div className="p-6 flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Fournisseur" value={fournisseur.nom} placeholder="ex. : SOBEBRA"
            onChange={e => setFournisseur(f => ({ ...f, nom: e.target.value }))} />
          <Input label="WhatsApp du fournisseur" type="tel" value={fournisseur.whatsapp} placeholder="ex. : 229 97 00 00 00"
            onChange={e => setFournisseur(f => ({ ...f, whatsapp: e.target.value }))} />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Quantités (en casiers)</span>
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
            <input type="checkbox" checked={toutAfficher} onChange={e => setToutAfficher(e.target.checked)} className="accent-secondary" />
            Tous les produits
          </label>
        </div>

        {loading ? <Skeleton variant="card" count={3} /> : visibles.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Aucun produit en alerte. Cochez « Tous les produits ».</p>
        ) : (
          <div className="flex flex-col divide-y divide-gray-100 border border-gray-100 rounded-xl max-h-80 overflow-y-auto">
            {visibles.map(l => (
              <div key={l.formatId} className="flex items-center gap-3 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-800 truncate">
                    {l.produit} <span className="text-gray-400 font-normal">{l.format}</span>
                  </div>
                  <div className={["text-xs", l.enAlerte ? "text-orange-600" : "text-gray-400"].join(" ")}>
                    Stock {l.stock} · seuil {l.seuil}{l.emballage ? ` · ${l.emballage}` : ""}
                  </div>
                </div>
                <input type="number" min="0" placeholder="0" value={quantites[l.formatId] ?? ""}
                  onChange={e => setQuantites(q => ({ ...q, [l.formatId]: e.target.value }))}
                  className="w-20 rounded-xl border border-slate-300 px-2.5 py-1.5 text-sm font-semibold text-right focus:outline-none focus:border-secondary" />
              </div>
            ))}
          </div>
        )}

        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Message</label>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:border-secondary" />
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">{commandees.length} produit{commandees.length > 1 ? "s" : ""}</span>
          <span className="font-bold text-primary">Total : {totalCasiers} casier{totalCasiers > 1 ? "s" : ""}</span>
        </div>

        <div className="flex flex-col gap-2">
          <Button icon={<Send size={15} />} onClick={envoyerWhatsApp} className="w-full justify-center">
            Envoyer par WhatsApp
          </Button>
          <div className="grid grid-cols-2 gap-2">
            {partageDisponible() ? (
              <Button variant="secondary" icon={envoi ? <Loader size={14} className="animate-spin" /> : <Share2 size={14} />}
                onClick={() => pdf("partager")} disabled={envoi}>Partager le PDF</Button>
            ) : (
              <Button variant="secondary" icon={envoi ? <Loader size={14} className="animate-spin" /> : <FileDown size={14} />}
                onClick={() => pdf("telecharger")} disabled={envoi}>Télécharger le PDF</Button>
            )}
            <Button variant="secondary" icon={<Copy size={14} />} onClick={copier}>Copier le texte</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
