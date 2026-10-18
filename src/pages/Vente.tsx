import { useEffect, useState } from "react";
import { Search, ShoppingCart, Plus, Minus, Trash2, Check, User, ChevronDown, X } from "lucide-react";
import { invoke } from "@/lib/db";
import { useToast } from "@/components/ui/Toast";
import { useVenteStore, type VenteItem } from "@/stores/venteStore";
import { useAppStore } from "@/stores/appStore";
import ModalConfirmationVente from "./ModalConfirmationVente";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import SoldesBandeau from "@/components/clients/SoldesBandeau";
import { volumeFr, casiers } from "@/lib/format";

interface Format { id: string; produit_id: string; volume: number; unite: string; prix: number; stock: number; seuil_alerte: number; emballage_id?: string | null; }
interface ProduitAvecFormats { produit: { id: string; nom: string }; formats: Format[]; }
interface Client {
  id: string; nom: string; telephone: string | null; est_defaut: number;
  solde_argent?: number; emballages_dus?: Record<string, number>;
}
interface PrixClient { format_id: string; prix_base: number; prix_client: number | null; }
export interface SoldesClient { solde_argent: number; emballages_dus: Record<string, number>; }

interface VenteResult {
  id: string;
  numero_facture: string;
  total: number;
  monnaie_rendue: number | null;
  items: VenteItem[];
  montant_recu: number;
  montant_paye: number;
  reste_du: number;
  emballages_livres: Record<string, number>;
  emballages_rendus: Record<string, number>;
  soldes: SoldesClient | null;
  solde_avant: { argent: number; emballages: Record<string, number> } | null;
  client_nom: string;
  client_telephone: string | null;
}

export default function Vente() {
  const { toast } = useToast();

  // Store
  const { client_id, items, total, montant_recu, monnaie_rendue,
    setClient, addItem, removeItem, updateQuantite, updatePrix, setMontantRecu, resetPanier } = useVenteStore();
  const { loadAlertes, formatMontant, symbole } = useAppStore();
  const formatPrix = formatMontant;

  // UI locale
  const [produits, setProduits] = useState<ProduitAvecFormats[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showClientDrop, setShowClientDrop] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [showCart, setShowCart] = useState(false);
  const [montantRecuStr, setMontantRecuStr] = useState(montant_recu > 0 ? String(montant_recu) : "");
  const [validating, setValidating] = useState(false);
  const [venteResult, setVenteResult] = useState<VenteResult | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  // Casiers et paiement partiel
  const [emballages, setEmballages] = useState<{ id: string; nom: string }[]>([]);
  const [rendusSaisis, setRendusSaisis] = useState<Record<string, string>>({});
  const [paiementPartiel, setPaiementPartiel] = useState(false);
  const [montantPayeStr, setMontantPayeStr] = useState("");
  // Fiche rapide quand un client de passage repart avec une dette
  const [clientRapide, setClientRapide] = useState(false);
  const [rapideNom, setRapideNom] = useState("");
  const [rapideTel, setRapideTel] = useState("");

  const chargerClients = async () => { setClients(await invoke<Client[]>("get_clients")); };

  useEffect(() => {
    Promise.all([
      invoke<{ id: string; nom: string }[]>("get_produits"),
      invoke<Client[]>("get_clients"),
    ]).then(async ([ps, cs]) => {
      setClients(cs);
      const all = await Promise.all(ps.map(p => invoke<ProduitAvecFormats>("get_produit", { id: p.id })));
      setProduits(all);
    }).finally(() => setLoading(false));
    invoke<{ id: string; nom: string }[]>("get_emballages").then(setEmballages).catch(() => {});
  }, []);

  // Prix spécifiques du client sélectionné (format_id → prix)
  const [prixClient, setPrixClient] = useState<Record<string, number>>({});
  useEffect(() => {
    let annule = false;
    invoke<PrixClient[]>("get_prix_client", { clientId: client_id })
      .then(rows => {
        if (annule) return;
        setPrixClient(Object.fromEntries(
          rows.filter(r => r.prix_client != null).map(r => [r.format_id, r.prix_client as number])
        ));
        // Réaligner les prix du panier sur le nouveau client
        const panier = useVenteStore.getState().items;
        for (const r of rows) {
          const item = panier.find(i => i.format_id === r.format_id);
          const prix = r.prix_client ?? r.prix_base;
          if (item && item.prix !== prix) updatePrix(r.format_id, prix);
        }
      })
      .catch(() => { if (!annule) setPrixClient({}); });
    return () => { annule = true; };
  }, [client_id]);
  const prixDe = (f: Format) => prixClient[f.id] ?? f.prix;

  const filtered = produits.filter(p =>
    p.produit.nom.toLowerCase().includes(search.toLowerCase())
  );

  const selectedClient = clients.find(c => c.id === client_id);
  const filteredClients = clients.filter(c => c.nom.toLowerCase().includes(clientSearch.toLowerCase()));

  const handleAddToCart = (f: Format, produitNom: string) => {
    // Vérification stock
    const existing = items.find(i => i.format_id === f.id);
    const currentQty = existing ? existing.quantite : 0;
    if (currentQty + 1 > f.stock) {
      toast(`Stock insuffisant pour ${produitNom} ${volumeFr(f.volume, f.unite)} (stock : ${f.stock})`, "error");
      return;
    }
    addItem({ format_id: f.id, nom: produitNom, volume: f.volume, unite: f.unite, prix: prixDe(f), stock: f.stock });
  };

  const handleUpdateQty = (format_id: string, newQty: number) => {
    const item = items.find(i => i.format_id === format_id);
    if (item && newQty > item.stock) {
      toast(`Stock insuffisant (max. : ${item.stock})`, "warning");
      return;
    }
    updateQuantite(format_id, newQty);
  };

  const handleMontantChange = (val: string) => {
    setMontantRecuStr(val);
    const parsed = parseFloat(val);
    setMontantRecu(isNaN(parsed) ? 0 : parsed);
  };

  // ── Casiers : livrés (1 par casier vendu) et rendus sur place ─────────────
  const emballageDuFormat = new Map(produits.flatMap(p => p.formats.map(f => [f.id, f.emballage_id ?? null] as const)));
  const nomEmballage = (id: string) => emballages.find(e => e.id === id)?.nom ?? "Casier";
  const livres: Record<string, number> = {};
  for (const i of items) {
    const e = emballageDuFormat.get(i.format_id);
    if (e) livres[e] = (livres[e] ?? 0) + i.quantite;
  }
  // Casiers que le client doit déjà : il peut les rapporter à cette livraison
  const dusClient: Record<string, number> = selectedClient && selectedClient.est_defaut !== 1
    ? Object.fromEntries(Object.entries(selectedClient.emballages_dus ?? {}).filter(([, n]) => n > 0))
    : {};
  const typesCasiers = [...new Set([...Object.keys(livres), ...Object.keys(dusClient)])];
  // Par défaut le client échange ses vides contre des pleins : rendus = livrés
  const rendus: Record<string, number> = Object.fromEntries(typesCasiers.map(e => {
    const saisi = rendusSaisis[e];
    const max = (livres[e] ?? 0) + (dusClient[e] ?? 0);
    return [e, saisi === undefined ? (livres[e] ?? 0) : Math.min(max, Math.max(0, parseInt(saisi) || 0))];
  }));
  const casiersNonRendus = typesCasiers.reduce((s, e) => s + Math.max(0, (livres[e] ?? 0) - rendus[e]), 0);

  // ── Paiement : complet par défaut, partiel ou à crédit sur demande ────────
  // Ce que le client devait déjà : il peut le régler en même temps que son achat
  const ancienSolde = selectedClient && selectedClient.est_defaut !== 1 ? Math.max(0, selectedClient.solde_argent ?? 0) : 0;
  const totalGeneral = total + ancienSolde;
  const montantPaye = paiementPartiel ? Math.min(totalGeneral, Math.max(0, parseFloat(montantPayeStr) || 0)) : total;
  // Positif : nouvelle dette ; négatif : le client rembourse une partie de l'ancienne
  const resteDu = total - montantPaye;
  const laisseUneDette = resteDu > 0 || casiersNonRendus > 0;

  const validerVente = async (clientForce?: Client) => {
    if (items.length === 0) { toast("Le panier est vide", "warning"); return; }
    // Vérification stock avant envoi
    for (const item of items) {
      if (item.quantite > item.stock) {
        toast(`Stock insuffisant pour ${item.nom} ${volumeFr(item.volume, item.unite)}`, "error");
        return;
      }
    }
    const client = clientForce ?? selectedClient;
    // Une dette doit toujours avoir un nom : on crée une fiche rapide pour le client de passage
    if (laisseUneDette && (!client || client.est_defaut === 1)) {
      setRapideNom(""); setRapideTel(""); setClientRapide(true);
      return;
    }
    setValidating(true);
    try {
      const result = await invoke<Omit<VenteResult, "items" | "montant_recu" | "client_nom" | "client_telephone">>(
        "create_vente",
        {
          clientId: client?.id ?? client_id,
          items: items.map(i => ({ formatId: i.format_id, quantite: i.quantite, prixUtilise: i.prix })),
          montantRecu: !paiementPartiel && montant_recu > 0 ? montant_recu : null,
          montantPaye: paiementPartiel ? montantPaye : null,
          emballagesRendus: rendus,
        }
      );
      // Capturer les données avant reset pour le modal
      setVenteResult({
        ...result, items: [...items], montant_recu: paiementPartiel ? 0 : montant_recu,
        client_nom: client?.nom ?? "Client", client_telephone: client?.telephone ?? null,
      });
      setShowCart(false);
      setShowConfirm(true);
      loadAlertes();
      chargerClients().catch(() => {});
    } catch (e) { toast(String(e), "error"); }
    setValidating(false);
  };

  const creerClientRapideEtValider = async () => {
    if (!rapideNom.trim()) { toast("Le nom est obligatoire", "warning"); return; }
    try {
      const id = await invoke<string>("create_client", { nom: rapideNom.trim(), telephone: rapideTel.trim() || null, adresse: null });
      const client: Client = { id, nom: rapideNom.trim(), telephone: rapideTel.trim() || null, est_defaut: 0 };
      setClients(cs => [...cs, client]);
      setClient(id);
      setClientRapide(false);
      await validerVente(client);
    } catch (e) { toast(String(e), "error"); }
  };

  const handleNouvelleVente = () => {
    resetPanier();
    setMontantRecuStr("");
    setRendusSaisis({});
    setPaiementPartiel(false);
    setMontantPayeStr("");
    setVenteResult(null);
    setShowConfirm(false);
  };

  // Affichage monnaie à rendre (live)
  const monnaieDisplay = montant_recu > 0 ? monnaie_rendue : null;

  // Fonction de rendu (et non composant) : sinon React remonte le panier à chaque
  // frappe et les champs de saisie perdent le focus.
  const renderPanier = () => (
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center gap-2 pl-4 pr-12 lg:pr-4 py-3 border-b border-slate-100">
        <ShoppingCart size={18} className="text-primary" />
        <span className="font-bold text-gray-900">Panier</span>
        {items.length > 0 && (
          <span className="ml-auto text-xs font-semibold text-gray-500">
            {casiers(items.reduce((s, i) => s + i.quantite, 0))}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400 py-12">
            <ShoppingCart size={40} strokeWidth={1.2} />
            <p className="text-sm">Panier vide</p>
          </div>
        ) : (
          <div className="p-3 flex flex-col gap-2">
            {items.map((item) => (
              <div key={item.format_id} className="flex gap-3 items-start pb-2 border-b border-gray-50 last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-800 truncate">{item.nom}</div>
                  <div className="text-xs text-gray-400">{volumeFr(item.volume, item.unite)}</div>
                  {item.quantite > item.stock && (
                    <div className="text-[10px] text-danger font-semibold mt-0.5">Stock insuffisant !</div>
                  )}
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                      <button aria-label="Un casier de moins" onClick={() => handleUpdateQty(item.format_id, item.quantite - 1)}
                        className="w-7 h-7 bg-gray-50 flex items-center justify-center hover:bg-gray-100 transition-colors">
                        <Minus size={11} />
                      </button>
                      <span className="w-8 text-center text-sm font-semibold text-gray-800">{item.quantite}</span>
                      <button aria-label="Un casier de plus" onClick={() => handleUpdateQty(item.format_id, item.quantite + 1)}
                        className="w-7 h-7 bg-gray-50 flex items-center justify-center hover:bg-gray-100 transition-colors">
                        <Plus size={11} />
                      </button>
                    </div>
                    <span className="text-xs text-gray-400">× {formatPrix(item.prix)}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="font-bold text-sm text-gray-800">{formatPrix(item.sous_total)}</span>
                  <button aria-label={`Retirer ${item.nom} du panier`} onClick={() => removeItem(item.format_id)}
                    className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-danger transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="border-t border-gray-100 p-4 flex flex-col gap-3">
          {/* Casiers consignés : livrés / rendus sur place */}
          {typesCasiers.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Casiers vides rendus</span>
              {typesCasiers.map(e => (
                <div key={e} className="flex items-center gap-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-gray-700">{nomEmballage(e)}</div>
                    <div className="text-[11px] text-gray-400">
                      {livres[e] ? `${livres[e]} livré${livres[e] > 1 ? "s" : ""}` : "aucun livré"}
                      {dusClient[e] ? ` · ${dusClient[e]} déjà dû${dusClient[e] > 1 ? "s" : ""}` : ""}
                    </div>
                  </div>
                  <button type="button" aria-label="Un casier rendu de moins"
                    onClick={() => setRendusSaisis(r => ({ ...r, [e]: String(Math.max(0, rendus[e] - 1)) }))}
                    className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center"><Minus size={13} /></button>
                  <input type="number" min="0" value={rendusSaisis[e] ?? String(rendus[e])} aria-label={`Casiers rendus : ${nomEmballage(e)}`}
                    onChange={ev => setRendusSaisis(r => ({ ...r, [e]: ev.target.value }))}
                    className="w-12 h-8 rounded-lg border border-slate-300 px-1 text-sm font-semibold text-center focus:outline-none focus:border-secondary" />
                  <button type="button" aria-label="Un casier rendu de plus"
                    onClick={() => setRendusSaisis(r => ({ ...r, [e]: String(Math.min((livres[e] ?? 0) + (dusClient[e] ?? 0), rendus[e] + 1)) }))}
                    className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center"><Plus size={13} /></button>
                </div>
              ))}
              {casiersNonRendus > 0 && (
                <div className="text-xs text-orange-700 bg-orange-50 rounded-lg px-3 py-1.5">
                  {casiersNonRendus} casier{casiersNonRendus > 1 ? "s" : ""} à rendre plus tard
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="font-bold text-gray-800">{ancienSolde > 0 ? "Achat du jour" : "Total"}</span>
            <span className="font-extrabold text-xl text-primary">{formatPrix(total)}</span>
          </div>
          {ancienSolde > 0 && (
            <div className="flex flex-col gap-0.5 bg-orange-50 rounded-lg px-3 py-2 text-xs text-orange-800">
              <div className="flex justify-between"><span>Ancien solde dû</span><span>{formatPrix(ancienSolde)}</span></div>
              <div className="flex justify-between font-bold"><span>Total général</span><span>{formatPrix(totalGeneral)}</span></div>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
            <input type="checkbox" checked={paiementPartiel} onChange={e => setPaiementPartiel(e.target.checked)}
              className="w-4 h-4 accent-secondary" />
            {ancienSolde > 0 ? "Paiement partiel ou règlement de la dette" : "Le client ne paie pas tout maintenant"}
          </label>

          {paiementPartiel ? (
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                Montant payé maintenant
              </label>
              <div className="relative">
                <input type="number" min="0" placeholder="0" value={montantPayeStr}
                  onChange={e => setMontantPayeStr(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold focus:outline-none focus:border-secondary pr-14" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-semibold">{symbole}</span>
              </div>
              {ancienSolde > 0 && (
                <div className="flex gap-2 mt-2">
                  <button type="button" onClick={() => setMontantPayeStr(String(total))}
                    className="flex-1 text-xs font-semibold py-1.5 rounded-xl border border-slate-200 hover:bg-gray-50">Achat seul</button>
                  <button type="button" onClick={() => setMontantPayeStr(String(totalGeneral))}
                    className="flex-1 text-xs font-semibold py-1.5 rounded-xl border border-slate-200 hover:bg-gray-50">Tout régler</button>
                </div>
              )}
              {ancienSolde + resteDu > 0 ? (
                <div className="mt-2 flex justify-between items-center bg-orange-50 rounded-lg px-3 py-2">
                  <span className="text-xs text-orange-700 font-medium">Le client devra encore</span>
                  <span className="font-extrabold text-orange-700 text-sm">{formatPrix(ancienSolde + resteDu)}</span>
                </div>
              ) : (
                <div className="mt-2 flex justify-between items-center bg-emerald-50 rounded-lg px-3 py-2">
                  <span className="text-xs text-emerald-700 font-medium">Compte soldé</span>
                  <span className="font-extrabold text-emerald-700 text-sm">✓</span>
                </div>
              )}
            </div>
          ) : (
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                Montant reçu (optionnel)
              </label>
              <div className="relative">
                <input type="number" min="0" placeholder={`Min. ${formatPrix(total)}`}
                  value={montantRecuStr} onChange={e => handleMontantChange(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold focus:outline-none focus:border-secondary pr-14" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-semibold">{symbole}</span>
              </div>
              {monnaieDisplay !== null && (
                <div className="mt-2 flex justify-between items-center bg-green-50 rounded-lg px-3 py-2">
                  <span className="text-xs text-green-700 font-medium">Monnaie à rendre</span>
                  <span className="font-extrabold text-secondary text-sm">{formatPrix(monnaieDisplay)}</span>
                </div>
              )}
            </div>
          )}

          {laisseUneDette && selectedClient?.est_defaut === 1 && (
            <p className="text-xs text-gray-500">
              Le client repart avec une dette : son nom et son téléphone seront demandés à la validation.
            </p>
          )}
          <button onClick={() => validerVente()} disabled={validating}
            className="w-full bg-secondary text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 text-sm shadow-[0_4px_12px_rgba(16,185,129,0.35)] hover:bg-secondary-600 active:scale-[0.98] transition-all disabled:opacity-60">
            <Check size={16} strokeWidth={2.5} />
            {validating ? "Validation…" : "Valider la vente"}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary-700 to-primary-600 px-4 sm:px-6 pb-3.5 pt-[calc(0.875rem+env(safe-area-inset-top))] flex items-center gap-3 flex-shrink-0">
        <div className="flex-1">
          <div className="text-white font-bold text-base">Nouvelle vente</div>
          <div className="text-white/50 text-xs">Enregistrer une commande</div>
        </div>
        <button onClick={() => setShowCart(true)} className="lg:hidden relative w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
          <ShoppingCart size={18} className="text-white" />
          {items.length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 bg-secondary rounded-full text-[10px] font-bold text-white flex items-center justify-center">
              {items.reduce((s, i) => s + i.quantite, 0)}
            </span>
          )}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Produits */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 pb-40 lg:pb-4">
          {/* Sélection client */}
          <div className="relative">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Client</label>
            <button onClick={() => setShowClientDrop(!showClientDrop)}
              className={["w-full flex items-center gap-2.5 px-3 py-2.5 bg-white border rounded-xl text-sm transition-colors",
                showClientDrop ? "border-secondary ring-2 ring-secondary/20" : "border-gray-300"].join(" ")}>
              <User size={15} className="text-gray-400 flex-shrink-0" />
              <span className="flex-1 text-left font-medium text-gray-800 truncate">
                {selectedClient?.nom ?? "Sélectionner un client"}
              </span>
              <ChevronDown size={14} className={["text-gray-400 transition-transform", showClientDrop ? "rotate-180" : ""].join(" ")} />
            </button>
            {showClientDrop && (
              <div className="absolute top-full mt-1 left-0 right-0 z-40 bg-white border border-gray-200 rounded-xl shadow-modal overflow-hidden">
                <div className="p-2 border-b border-gray-100">
                  <input autoFocus value={clientSearch} onChange={e => setClientSearch(e.target.value)}
                    placeholder="Rechercher…" className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-secondary" />
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {filteredClients.map(c => (
                    <button key={c.id} onClick={() => { setClient(c.id); setShowClientDrop(false); setClientSearch(""); }}
                      className={["w-full flex items-center gap-3 px-3 py-2.5 text-left border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors",
                        client_id === c.id ? "bg-green-50" : ""].join(" ")}>
                      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                        <span className="text-white font-bold text-xs">{c.nom[0]}</span>
                      </div>
                      <span className="text-sm font-medium text-gray-800">{c.nom}</span>
                      {client_id === c.id && <Check size={14} className="text-secondary ml-auto" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* Ce que le client doit déjà (rappel avant de servir) */}
            {selectedClient && selectedClient.est_defaut !== 1 && <SoldesBandeau client={selectedClient} nomEmballage={nomEmballage} />}
          </div>

          {/* Recherche produit */}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un produit…"
              className="w-full pl-9 pr-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-secondary" />
          </div>

          {/* Grille produits */}
          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-white rounded-xl p-3 h-36 animate-pulse">
                  <div className="h-3 bg-gray-200 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-gray-200 rounded w-1/2 mb-4" />
                  <div className="h-7 bg-gray-200 rounded" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map(({ produit, formats }) => (
                <ProduitCard key={produit.id} nom={produit.nom} formats={formats}
                  cartItems={items} onAdd={handleAddToCart} prixClient={prixClient} />
              ))}
              {filtered.length === 0 && (
                <div className="col-span-2 lg:col-span-3 text-center py-10 text-gray-400 text-sm">
                  Aucun produit trouvé
                </div>
              )}
            </div>
          )}
        </div>

        {/* Desktop cart */}
        <div className="hidden lg:flex w-80 xl:w-96 border-l border-slate-200/70 flex-shrink-0">
          <div className="flex-1 flex flex-col">
            {renderPanier()}
          </div>
        </div>
      </div>

      {/* Barre « Voir le panier » sur téléphone : le panier toujours à portée de pouce */}
      {items.length > 0 && !showCart && (
        <button onClick={() => setShowCart(true)}
          className="lg:hidden fixed left-3 right-3 z-30 bottom-[calc(72px+env(safe-area-inset-bottom))] h-14 px-4 rounded-2xl
            bg-primary-700 text-white shadow-modal flex items-center gap-3 animate-slide-up active:scale-[0.98] transition-transform">
          <span className="relative">
            <ShoppingCart size={20} />
            <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 bg-secondary rounded-full text-[10px] font-bold flex items-center justify-center">
              {items.reduce((s, i) => s + i.quantite, 0)}
            </span>
          </span>
          <span className="flex-1 text-left text-sm font-semibold">Voir le panier</span>
          <span className="font-extrabold tabular-nums">{formatPrix(total)}</span>
        </button>
      )}

      {/* Mobile cart sheet */}
      {showCart && (
        <>
          <div className="fixed inset-0 z-[45] bg-slate-900/40 backdrop-blur-[2px] animate-fade-in lg:hidden" onClick={() => setShowCart(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-white rounded-t-3xl max-h-[88vh] flex flex-col overflow-hidden shadow-modal animate-slide-up pb-safe">
            <div className="flex items-center justify-between px-4 pt-3 pb-1">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto" />
            </div>
            <button onClick={() => setShowCart(false)} className="absolute top-5 right-3 p-2 rounded-full hover:bg-slate-100" aria-label="Fermer le panier">
              <X size={16} className="text-gray-500" />
            </button>
            <div className="flex-1 overflow-hidden">
              {renderPanier()}
            </div>
          </div>
        </>
      )}

      {/* Modal confirmation */}
      {venteResult && showConfirm && (
        <ModalConfirmationVente
          isOpen={showConfirm}
          // La vente est enregistrée : fermer vide le panier pour éviter de la valider deux fois
          onClose={handleNouvelleVente}
          venteId={venteResult.id}
          numeroFacture={venteResult.numero_facture}
          clientNom={venteResult.client_nom}
          clientTelephone={venteResult.client_telephone}
          items={venteResult.items}
          total={venteResult.total}
          montantRecu={venteResult.montant_recu}
          monnaieRendue={venteResult.monnaie_rendue}
          montantPaye={venteResult.montant_paye}

          emballagesLivres={venteResult.emballages_livres}
          emballagesRendus={venteResult.emballages_rendus}
          soldeAvant={venteResult.solde_avant}
          nomEmballage={nomEmballage}
          onNouvelleVente={handleNouvelleVente}
        />
      )}

      {/* Fiche rapide : un client de passage qui repart avec une dette doit être identifié */}
      <Modal isOpen={clientRapide} onClose={() => setClientRapide(false)} title="Qui doit ?">
        <div className="p-6 flex flex-col gap-4">
          <p className="text-sm text-gray-600">
            Ce client repart avec
            {resteDu > 0 && <strong> {formatPrix(resteDu)} à payer</strong>}
            {resteDu > 0 && casiersNonRendus > 0 && " et"}
            {casiersNonRendus > 0 && <strong> {casiersNonRendus} casier{casiersNonRendus > 1 ? "s" : ""} à rendre</strong>}.
            Pour garder une trace, enregistrez son nom et son téléphone.
          </p>
          <Input label="Nom" value={rapideNom} onChange={e => setRapideNom(e.target.value)} placeholder="ex. : Mme Adjovi (fête samedi)" autoFocus />
          <Input label="Téléphone" type="tel" value={rapideTel} onChange={e => setRapideTel(e.target.value)} placeholder="+229 97 00 00 00" />
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setClientRapide(false)}>Annuler</Button>
            <Button onClick={creerClientRapideEtValider} loading={validating}>Enregistrer et valider</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ProduitCard({
  nom, formats, cartItems, onAdd, prixClient,
}: {
  nom: string;
  formats: Format[];
  cartItems: VenteItem[];
  onAdd: (f: Format, nom: string) => void;
  prixClient: Record<string, number>;
}) {
  const formatPrix = useAppStore((s) => s.formatMontant);
  const [formatIdx, setFormatIdx] = useState(0);
  const fmt = formats[formatIdx];
  if (!fmt) return null;
  const prixDe = (f: Format) => prixClient[f.id] ?? f.prix;
  const prixSpecifique = prixClient[fmt.id] != null && prixClient[fmt.id] !== fmt.prix;
  const outOfStock = fmt.stock <= 0;
  const lowStock = !outOfStock && fmt.stock <= fmt.seuil_alerte;
  const inCart = cartItems.find(i => i.format_id === fmt.id);

  return (
    <div className={["relative bg-white rounded-2xl p-3 flex flex-col gap-2.5 shadow-card border transition-all",
      outOfStock ? "border-slate-200/70 opacity-60" : inCart ? "border-secondary ring-2 ring-secondary/15" : "border-slate-200/70 hover:shadow-card-hover"].join(" ")}>
      {inCart && (
        <span className="absolute -top-2 -right-2 min-w-[24px] h-6 px-1.5 rounded-full bg-secondary text-white text-xs font-bold flex items-center justify-center shadow-glow">
          {inCart.quantite}
        </span>
      )}

      <div className="min-w-0">
        <div className="font-bold text-[15px] text-gray-900 truncate">{nom}</div>
        <div className={["text-xs font-medium mt-0.5",
          outOfStock ? "text-danger" : lowStock ? "text-amber-600" : "text-gray-400"].join(" ")}>
          {outOfStock ? "Rupture de stock" : `${casiers(fmt.stock)} en stock`}
        </div>
      </div>

      {/* Formats : pastilles à toucher (liste déroulante seulement s'il y en a beaucoup) */}
      {formats.length > 1 && formats.length <= 3 && (
        <div className="flex flex-wrap gap-1">
          {formats.map((f, i) => (
            <button key={f.id} onClick={() => setFormatIdx(i)}
              className={["px-2 py-1 rounded-lg text-[11px] font-semibold border transition-colors",
                i === formatIdx ? "bg-primary text-white border-primary" : "bg-white text-gray-600 border-slate-200 hover:border-slate-300"].join(" ")}>
              {volumeFr(f.volume, f.unite)}
            </button>
          ))}
        </div>
      )}
      {formats.length > 3 && (
        <select value={formatIdx} onChange={e => setFormatIdx(+e.target.value)}
          className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50 focus:outline-none focus:border-secondary">
          {formats.map((f, i) => (
            <option key={f.id} value={i}>{volumeFr(f.volume, f.unite)} — {formatPrix(prixDe(f))}</option>
          ))}
        </select>
      )}
      {formats.length === 1 && (
        <span className="self-start px-2 py-0.5 rounded-lg bg-slate-100 text-[11px] font-semibold text-gray-600">{volumeFr(fmt.volume, fmt.unite)}</span>
      )}

      <div className="mt-auto">
        <div className="text-base font-extrabold text-primary-700 tabular-nums leading-tight">{formatPrix(prixDe(fmt))}</div>
        {prixSpecifique && (
          <div className="text-[11px] text-gray-400">
            <span className="line-through">{formatPrix(fmt.prix)}</span>
            <span className="ml-1 font-semibold text-secondary-700">prix client</span>
          </div>
        )}
      </div>

      <button onClick={() => !outOfStock && onAdd(fmt, nom)} disabled={outOfStock}
        className="w-full h-10 flex items-center justify-center gap-1.5 rounded-xl text-sm font-semibold transition-all bg-secondary text-white hover:bg-secondary-600 active:scale-95 disabled:bg-slate-200 disabled:text-gray-400 disabled:cursor-not-allowed">
        <Plus size={15} strokeWidth={2.5} />
        Ajouter
      </button>
    </div>
  );
}
