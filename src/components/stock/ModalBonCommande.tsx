import { useEffect, useState } from "react";
import { Send, FileDown, Share2, Copy, Loader, CheckCircle2 } from "lucide-react";
import { invoke } from "@/lib/db";
import { volumeFr } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import type { BonCommandeData } from "@/components/stock/BonCommandePDF";
import {
  genererBonCommandePDF, texteBonCommande, telechargerBlob, partagerBlob, partageDisponible,
} from "@/lib/pdf";

interface Format { casier?: number | null; id: string; volume: number; unite: string; stock: number; seuil_alerte: number; emballage_id?: string | null; }
interface Ligne { formatId: string; produit: string; format: string; emballage: string | null; stock: number; seuil: number; enAlerte: boolean; }
interface Fournisseur { id: string; nom: string; telephone: string | null; }
interface CommandeEnregistree { id: string; numero: string; date: string; }

const champ = "w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-secondary disabled:bg-slate-50 disabled:text-gray-500";

const dateLongue = (d: string) => new Date(d.replace(" ", "T")).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

/**
 * Bon de commande fournisseur : quantités en casiers, envoi WhatsApp ou PDF.
 * Au premier envoi la commande est enregistrée (en attente de livraison) et ne change plus.
 */
export default function ModalBonCommande({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [quantites, setQuantites] = useState<Record<string, string>>({});
  const [toutAfficher, setToutAfficher] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [fid, setFid] = useState("");
  const [nouveau, setNouveau] = useState({ nom: "", telephone: "" });
  const [note, setNote] = useState("Merci de confirmer la date de livraison.");
  const [commerce, setCommerce] = useState({ nom: "Mon Dépôt", adresse: "", telephone: "" });
  const [commande, setCommande] = useState<CommandeEnregistree | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true); setCommande(null); setNouveau({ nom: "", telephone: "" });
    (async () => {
      const [produits, emballages, params, fs] = await Promise.all([
        invoke<{ id: string; nom: string }[]>("get_produits"),
        invoke<{ id: string; nom: string }[]>("get_emballages").catch(() => []),
        invoke<{ nom_commerce: string; adresse_commerce: string | null; telephone_commerce: string | null }>("get_parametres"),
        invoke<Fournisseur[]>("get_fournisseurs").catch(() => []),
      ]);
      setCommerce({ nom: params.nom_commerce, adresse: params.adresse_commerce ?? "", telephone: params.telephone_commerce ?? "" });
      setFournisseurs(fs);
      setFid(fs.length === 1 ? fs[0].id : "");
      const details = await Promise.all(produits.map(p => invoke<{ formats: Format[] }>("get_produit", { id: p.id })));
      const toutes: Ligne[] = produits.flatMap((p, i) => details[i].formats.map(f => ({
        formatId: f.id, produit: p.nom, format: volumeFr(f.volume, f.unite, f.casier),
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
  const choisi = fournisseurs.find(f => f.id === fid);
  const nomFournisseur = choisi?.nom ?? nouveau.nom.trim();
  const telephone = choisi ? choisi.telephone ?? "" : nouveau.telephone;

  const donnees = (c: CommandeEnregistree): BonCommandeData => ({
    numero: c.numero, date: dateLongue(c.date),
    commerce,
    fournisseur: nomFournisseur,
    note: note.trim(),
    lignes: commandees.map(l => ({ produit: l.produit, format: l.format, emballage: l.emballage, quantite: parseInt(quantites[l.formatId]) })),
  });

  /** Vérifications sans attente, avant d'ouvrir une fenêtre ou un partage. */
  const pret = () => {
    if (commande) return true;
    if (commandees.length === 0) { toast("Indiquez au moins une quantité", "warning"); return false; }
    if (!nomFournisseur) { toast("Choisissez le fournisseur", "warning"); return false; }
    return true;
  };

  /** Enregistre la commande au premier envoi ; les envois suivants reprennent la même. */
  const enregistrer = async (): Promise<CommandeEnregistree> => {
    if (commande) return commande;
    let id = fid;
    if (!id) {
      id = await invoke<string>("create_fournisseur", { nom: nouveau.nom.trim(), telephone: nouveau.telephone.trim() || null });
      setFournisseurs(fs => [...fs, { id, nom: nouveau.nom.trim(), telephone: nouveau.telephone.trim() || null }]);
      setFid(id);
    }
    const c = await invoke<CommandeEnregistree>("creer_commande_fournisseur", {
      fournisseurId: id, note,
      lignes: commandees.map(l => ({ formatId: l.formatId, quantite: parseInt(quantites[l.formatId]) })),
    });
    setCommande(c);
    return c;
  };

  const envoyerWhatsApp = async () => {
    if (!pret()) return;
    // Fenêtre ouverte tout de suite : ouverte après l'enregistrement, le téléphone la bloquerait
    const fenetre = window.open("", "_blank");
    setEnvoi(true);
    try {
      const c = await enregistrer();
      // Numéro international sans + ni espaces (ex. 22997000000) ; sans numéro, WhatsApp demande le contact
      const url = `https://wa.me/${telephone.replace(/\D/g, "")}?text=${encodeURIComponent(texteBonCommande(donnees(c)))}`;
      if (fenetre) fenetre.location.href = url; else window.open(url, "_blank");
    } catch (e) { fenetre?.close(); toast(e instanceof Error ? e.message : String(e), "error"); }
    setEnvoi(false);
  };

  const pdf = async (mode: "partager" | "telecharger") => {
    if (!pret()) return;
    setEnvoi(true);
    try {
      const d = donnees(await enregistrer());
      const blob = await genererBonCommandePDF(d);
      if (mode === "partager") await partagerBlob(blob, `${d.numero}.pdf`, `Bon de commande ${d.numero}`);
      else telechargerBlob(blob, `${d.numero}.pdf`);
    } catch (e) { toast(e instanceof Error ? e.message : String(e), "error"); }
    setEnvoi(false);
  };

  const copier = async () => {
    if (!pret()) return;
    setEnvoi(true);
    try {
      const c = await enregistrer();
      try { await navigator.clipboard.writeText(texteBonCommande(donnees(c))); toast("Texte copié", "success"); }
      catch { toast("Copie impossible sur cet appareil", "error"); }
    } catch (e) { toast(e instanceof Error ? e.message : String(e), "error"); }
    setEnvoi(false);
  };

  const verrouille = !!commande;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Bon de commande fournisseur" size="lg">
      <div className="p-4 sm:p-6 flex flex-col gap-4">
        <div>
          <label className="text-[13px] font-medium text-gray-700 block mb-1.5">Fournisseur</label>
          <select value={fid} onChange={e => setFid(e.target.value)} disabled={verrouille} className={champ}>
            <option value="">{fournisseurs.length ? "— Choisir —" : "Nouveau fournisseur…"}</option>
            {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
          </select>
          {!fid ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
              <input value={nouveau.nom} onChange={e => setNouveau(n => ({ ...n, nom: e.target.value }))} disabled={verrouille}
                placeholder="ou nom d'un nouveau fournisseur" className={champ} />
              <input type="tel" value={nouveau.telephone} onChange={e => setNouveau(n => ({ ...n, telephone: e.target.value }))} disabled={verrouille}
                placeholder="WhatsApp, ex. : 229 97 00 00 00" className={champ} />
            </div>
          ) : (
            <p className="text-xs text-gray-500 mt-1.5">
              {telephone ? `WhatsApp : ${telephone}` : "Pas de numéro sur la fiche : WhatsApp vous demandera le contact."}
            </p>
          )}
        </div>

        {commande && (
          <div className="flex items-start gap-2.5 rounded-xl bg-emerald-50 text-emerald-800 px-3 py-2.5 text-sm">
            <CheckCircle2 size={17} className="flex-shrink-0 mt-0.5" />
            <span>
              Commande <b>{commande.numero}</b> enregistrée, en attente de livraison.
              Vous pouvez encore la partager ; à l'arrivée, reprenez-la dans « Réceptionner ».
            </span>
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Quantités (en casiers)</span>
          {!verrouille && (
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
              <input type="checkbox" checked={toutAfficher} onChange={e => setToutAfficher(e.target.checked)} className="accent-secondary" />
              Tous les produits
            </label>
          )}
        </div>

        {loading ? <Skeleton variant="card" count={3} /> : (verrouille ? commandees : visibles).length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Aucun produit en alerte. Cochez « Tous les produits ».</p>
        ) : (
          <div className="flex flex-col divide-y divide-slate-100 border border-slate-200 rounded-xl max-h-80 overflow-y-auto">
            {(verrouille ? commandees : visibles).map(l => (
              <div key={l.formatId} className="flex items-center gap-3 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-800 truncate">
                    {l.produit} <span className="text-gray-400 font-normal">{l.format}</span>
                  </div>
                  <div className={["text-xs", l.enAlerte ? "text-orange-600" : "text-gray-400"].join(" ")}>
                    Stock {l.stock} · seuil {l.seuil}{l.emballage ? ` · ${l.emballage}` : ""}
                  </div>
                </div>
                <input type="number" min="0" placeholder="0" value={quantites[l.formatId] ?? ""} disabled={verrouille}
                  onChange={e => setQuantites(q => ({ ...q, [l.formatId]: e.target.value }))}
                  className="w-20 rounded-xl border border-slate-300 px-2.5 py-1.5 text-sm font-semibold text-right focus:outline-none focus:border-secondary disabled:bg-slate-50" />
              </div>
            ))}
          </div>
        )}

        <div>
          <label className="text-[13px] font-medium text-gray-700 block mb-1.5">Message</label>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:border-secondary" />
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">{commandees.length} produit{commandees.length > 1 ? "s" : ""}</span>
          <span className="font-bold text-primary">Total : {totalCasiers} casier{totalCasiers > 1 ? "s" : ""}</span>
        </div>

        <div className="flex flex-col gap-2">
          <Button icon={envoi ? <Loader size={15} className="animate-spin" /> : <Send size={15} />} onClick={envoyerWhatsApp} disabled={envoi} className="w-full justify-center">
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
            <Button variant="secondary" icon={<Copy size={14} />} onClick={copier} disabled={envoi}>Copier le texte</Button>
          </div>
          {!commande && <p className="text-[11px] text-gray-400 text-center">Le premier envoi enregistre la commande : elle restera en attente jusqu'à la livraison.</p>}
        </div>
      </div>
    </Modal>
  );
}
