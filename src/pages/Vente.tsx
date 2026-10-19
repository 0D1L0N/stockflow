import { useEffect, useRef, useState } from "react";
import { Search, ShoppingCart, Plus, Minus, Trash2, Check, User, ChevronDown, X, FileText } from "lucide-react";
import { sansAccent } from "@/lib/format";
import { invoke } from "@/lib/db";
import { useToast } from "@/components/ui/Toast";
import { useVenteStore, type VenteItem } from "@/stores/venteStore";
import { useAppStore } from "@/stores/appStore";
import ModalConfirmationVente from "./ModalConfirmationVente";
import ModalApercuFacture from "@/components/facture/ModalApercuFacture";
import { construireCompte } from "@/lib/pdf";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import SoldesBandeau from "@/components/clients/SoldesBandeau";
import { volumeFr, casiers, telephoneFr } from "@/lib/format";
import Avatar from "@/components/ui/Avatar";
import { useTempsReel } from "@/lib/tempsReel";
import { useAuthStore } from "@/stores/authStore";
import Pastilles from "@/components/ui/Pastilles";
import { familleDe, grouperParFamille, type CleFamille, type Rayon } from "@/lib/familles";
import { useRetourFerme } from "@/lib/retour";
import { useClavierOuvert } from "@/lib/clavier";
import { useCatalogue } from "@/stores/catalogueStore";

interface Format { casier?: number | null; id: string; produit_id: string; volume: number; unite: string; prix: number; stock: number; seuil_alerte: number; emballage_id?: string | null; }
interface ProduitAvecFormats { produit: { id: string; nom: string; rayon?: Rayon | null }; formats: Format[]; }
interface Client {
  id: string; nom: string; telephone: string | null; est_defaut: number;
  solde_argent?: number; emballages_dus?: Record<string, number>;
}
interface PrixClient { format_id: string; prix_base: number; prix_client: number | null; prix_groupe: number | null; }
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
  const { loadAlertes, formatMontant, symbole, position } = useAppStore();
  const formatPrix = formatMontant;

  // UI locale
  // Catalogue partagé : déjà en mémoire, tenu à jour en direct (aucune requête à l'affichage)
  const catalogue = useCatalogue();
  const produits = catalogue.produits as ProduitAvecFormats[];
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsCharges, setClientsCharges] = useState(false);
  const loading = !catalogue.pret || !clientsCharges;
  const [search, setSearch] = useState("");
  const [famille, setFamille] = useState<"toutes" | CleFamille>("toutes");
  const estGerant = useAuthStore((s) => s.profil?.role === "gerant");
  // Prix modifié dans le panier (gérant) : format en cours d'édition et saisie
  const [prixEdite, setPrixEdite] = useState<string | null>(null);
  const [prixSaisi, setPrixSaisi] = useState("");
  const [showClientDrop, setShowClientDrop] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [showCart, setShowCart] = useState(false);
  useRetourFerme(showCart, () => setShowCart(false));
  const clavierOuvert = useClavierOuvert();
  const [montantRecuStr, setMontantRecuStr] = useState(montant_recu > 0 ? String(montant_recu) : "");
  const [validating, setValidating] = useState(false);
  const [showApercu, setShowApercu] = useState(false);
  const [venteResult, setVenteResult] = useState<VenteResult | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  // Casiers et paiement partiel
  const emballages = catalogue.emballages;
  const [rendusSaisis, setRendusSaisis] = useState<Record<string, string>>({});
  const [paiementPartiel, setPaiementPartiel] = useState(false);
  const [montantPayeStr, setMontantPayeStr] = useState("");
  // Fiche rapide quand un client de passage repart avec une dette
  const [clientRapide, setClientRapide] = useState(false);
  const [rapideNom, setRapideNom] = useState("");
  const [rapideTel, setRapideTel] = useState("");

  const chargerClients = async () => { setClients(await invoke<Client[]>("get_clients")); };

  useEffect(() => { chargerClients().catch(() => {}).finally(() => setClientsCharges(true)); }, []);

  // Soldes clients à jour quand un autre appareil vend (le stock suit le catalogue partagé)
  useTempsReel(["clients"], () => { chargerClients().catch(() => {}); });
  // Prix par client ou par groupe modifiés par le gérant sur un autre appareil
  useTempsReel(["prix"], () => { setVersionPrix(v => v + 1); chargerClients().catch(() => {}); });

  // Prix du client sélectionné : propre, sinon celui de son groupe (format_id → prix)
  const [prixClient, setPrixClient] = useState<Record<string, number>>({});
  // Incrémenté quand les prix changent sur un autre appareil (relit les prix sans toucher au panier)
  const [versionPrix, setVersionPrix] = useState(0);
  const dernierClientPrix = useRef<string | null>(null); // null : premier chargement, on réaligne aussi
  useEffect(() => {
    const changementDeClient = dernierClientPrix.current !== client_id;
    dernierClientPrix.current = client_id;
    let annule = false;
    invoke<PrixClient[]>("get_prix_client", { clientId: client_id })
      .then(rows => {
        if (annule) return;
        setPrixClient(Object.fromEntries(
          rows.filter(r => (r.prix_client ?? r.prix_groupe) != null).map(r => [r.format_id, (r.prix_client ?? r.prix_groupe) as number])
        ));
        // Réaligner les prix du panier sur le nouveau client (pas lors d'une simple mise à jour des prix)
        if (!changementDeClient) return;
        const panier = useVenteStore.getState().items;
        for (const r of rows) {
          const item = panier.find(i => i.format_id === r.format_id);
          const prix = r.prix_client ?? r.prix_groupe ?? r.prix_base;
          if (item && item.prix !== prix) updatePrix(r.format_id, prix);
        }
      })
      .catch(() => { if (!annule) setPrixClient({}); });
    return () => { annule = true; };
  }, [client_id, versionPrix]);
  const prixDe = (f: Format) => prixClient[f.id] ?? f.prix;

  const termes = sansAccent(search).split(/\s+/).filter(Boolean);
  const recherche = termes.length > 0;
  // Chaque mot doit se retrouver dans le nom ou un format (« pils 33 », « beninoise »)
  const filtered = !recherche ? produits : produits
    .map(p => {
      const nom = sansAccent(p.produit.nom);
      if (termes.every(t => nom.includes(t))) return p;
      const formats = p.formats.filter(f => termes.every(t => `${nom} ${sansAccent(volumeFr(f.volume, f.unite, f.casier))} ${String(f.volume)}`.includes(t)));
      return formats.length ? { ...p, formats } : null;
    })
    .filter((p): p is ProduitAvecFormats => p !== null);
  // Une carte par produit et par famille (Béninoise casier 12, Béninoise casier 24…), comme sur les fiches
  const cartes = filtered.flatMap(({ produit, formats }) => {
    const parFamille = new Map<CleFamille, Format[]>();
    formats.forEach(f => {
      const cle = familleDe(f.emballage_id, produit.rayon);
      parFamille.set(cle, [...(parFamille.get(cle) ?? []), f]);
    });
    return [...parFamille].map(([cle, fs]) => ({ cle, produit, formats: fs }));
  });
  const groupes = grouperParFamille(cartes, c => c.cle);
  // Pendant une recherche, toutes les familles : le produit cherché ne doit jamais être caché
  const groupesAffiches = groupes.filter(g => recherche || famille === "toutes" || g.cle === famille);
  const nbResultats = cartes.length;

  // La barre de recherche reste en haut ; en tapant, la liste remonte pour montrer les résultats au-dessus du clavier
  const listeRef = useRef<HTMLDivElement>(null);
  const rechercheRef = useRef<HTMLDivElement>(null);
  const montrerResultats = () => {
    const liste = listeRef.current, barre = rechercheRef.current;
    if (!liste || !barre) return;
    const cible = liste.scrollTop + barre.getBoundingClientRect().top - liste.getBoundingClientRect().top;
    // Le haut de la barre arrive tout en haut de la zone qui défile
    if (Math.abs(liste.scrollTop - cible) > 4) liste.scrollTo({ top: cible });
  };
  useEffect(() => { if (recherche) montrerResultats(); }, [search]);

  const selectedClient = clients.find(c => c.id === client_id);
  const filteredClients = clients.filter(c => sansAccent(c.nom).includes(sansAccent(clientSearch)));

  const handleAddToCart = (f: Format, produitNom: string) => {
    if (prixDe(f) <= 0) { toast(`Le prix de ${produitNom} ${volumeFr(f.volume, f.unite, f.casier)} n'est pas encore fixé (Produits)`, "warning"); return; }
    // Vérification stock
    const existing = items.find(i => i.format_id === f.id);
    const currentQty = existing ? existing.quantite : 0;
    if (currentQty + 1 > f.stock) {
      toast(`Stock insuffisant pour ${produitNom} ${volumeFr(f.volume, f.unite, f.casier)} (stock : ${f.stock})`, "error");
      return;
    }
    addItem({ format_id: f.id, nom: produitNom, volume: f.volume, unite: f.unite, casier: f.casier ?? null, prix: prixDe(f), stock: f.stock });
  };

  /** Nouveau prix saisi au panier : appliqué à la vente et retenu dans les prix du client. */
  const validerPrix = async (item: VenteItem) => {
    const p = parseFloat(prixSaisi);
    setPrixEdite(null);
    if (isNaN(p) || p <= 0 || p === item.prix) return;
    updatePrix(item.format_id, p);
    const nomme = selectedClient && selectedClient.est_defaut !== 1;
    if (!nomme) return;
    try {
      await invoke("set_prix_client", { clientId: client_id, formatId: item.format_id, prix: p });
      setPrixClient(prev => ({ ...prev, [item.format_id]: p }));
      toast(`Prix de ${selectedClient.nom} mis à jour`, "success");
    } catch (e) { toast(String(e), "error"); }
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

  // ── Aperçu de la facture : mêmes chiffres que ceux que la vente enregistrera ──
  const clientNomme = !!selectedClient && selectedClient.est_defaut !== 1;
  const apercuFacture = () => {
    const recu = !paiementPartiel && montant_recu > 0 ? montant_recu : null;
    return {
      date: new Date().toLocaleString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }),
      client: { nom: selectedClient?.nom ?? "Client", telephone: selectedClient?.telephone ?? "", adresse: "" },
      items: items.map(i => ({
        nom_produit: i.nom, volume: volumeFr(i.volume, i.unite, i.casier),
        quantite: i.quantite, prix_unitaire: i.prix, sous_total: i.sous_total,
      })),
      total,
      montant_recu: recu,
      monnaie_rendue: recu === null ? null : Math.max(0, recu - total),
      devise: { symbole, position },
      vendeur: useAuthStore.getState().profil?.nom || undefined,
      compte: construireCompte({
        total, montant_paye: montantPaye, emballages_livres: livres,
        emballages_rendus: Object.fromEntries(Object.entries(rendus).filter(([, n]) => n > 0)),
        solde_avant: {
          argent: clientNomme ? selectedClient?.solde_argent ?? 0 : 0,
          emballages: clientNomme ? { ...(selectedClient?.emballages_dus ?? {}) } : {},
        },
      }, nomEmballage),
    };
  };

  const validerVente = async (clientForce?: Client) => {
    if (items.length === 0) { toast("Le panier est vide", "warning"); return; }
    // Vérification stock avant envoi
    for (const item of items) {
      if (item.quantite > item.stock) {
        toast(`Stock insuffisant pour ${item.nom} ${volumeFr(item.volume, item.unite, item.casier)}`, "error");
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
      const client: Client = { id, nom: rapideNom.trim(), telephone: telephoneFr(rapideTel), est_defaut: 0 };
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
  // Sur téléphone tout le panier défile d'un bloc ; sur grand écran seule la liste défile
  const renderPanier = (mobile = false) => (
    <div className={mobile ? "flex flex-col bg-white" : "flex flex-col h-full bg-white"}>
      <div className={["flex items-center gap-2 pl-4 pr-12 lg:pr-4 py-3 border-b border-slate-100", mobile ? "sticky top-0 z-10 bg-white" : ""].join(" ")}>
        <ShoppingCart size={18} className="text-primary" />
        <span className="font-bold text-gray-900">Panier</span>
        {items.length > 0 && (
          <span className="ml-auto text-xs font-semibold text-gray-500">
            {casiers(items.reduce((s, i) => s + i.quantite, 0))}{mobile && <span className="text-ink-900 font-bold"> · {formatPrix(total)}</span>}
          </span>
        )}
      </div>

      <div className={mobile ? "" : "flex-1 overflow-y-auto"}>
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400 py-12">
            <ShoppingCart size={40} strokeWidth={1.2} />
            <p className="text-sm">Panier vide</p>
          </div>
        ) : (
          <div className="p-3 flex flex-col gap-2">
            {items.map((item) => (
              <div key={item.format_id} className="flex gap-3 items-start pb-2 border-b border-slate-100 last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-800 truncate">{item.nom}</div>
                  <div className="text-xs text-gray-400">{volumeFr(item.volume, item.unite, item.casier)}</div>
                  {item.quantite > item.stock && (
                    <div className="text-[10px] text-danger font-semibold mt-0.5">Stock insuffisant !</div>
                  )}
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden">
                      <button aria-label="Un casier de moins" onClick={() => handleUpdateQty(item.format_id, item.quantite - 1)}
                        className="w-10 h-10 bg-slate-50 flex items-center justify-center hover:bg-gray-100 transition-colors">
                        <Minus size={14} />
                      </button>
                      <input type="number" inputMode="numeric" min="1" value={item.quantite} aria-label={`Nombre de casiers ${item.nom}`}
                        onFocus={e => e.target.select()}
                        onChange={e => { const n = parseInt(e.target.value); if (n >= 1) handleUpdateQty(item.format_id, n); }}
                        className="w-12 h-10 text-center text-sm font-semibold text-gray-800 focus:outline-none" />
                      <button aria-label="Un casier de plus" onClick={() => handleUpdateQty(item.format_id, item.quantite + 1)}
                        className="w-10 h-10 bg-slate-50 flex items-center justify-center hover:bg-gray-100 transition-colors">
                        <Plus size={14} />
                      </button>
                    </div>
                    {prixEdite === item.format_id ? (
                      <input type="number" inputMode="numeric" min="0" autoFocus value={prixSaisi} aria-label="Prix du casier"
                        onChange={e => setPrixSaisi(e.target.value)}
                        onBlur={() => validerPrix(item)}
                        onKeyDown={e => { if (e.key === "Enter") validerPrix(item); if (e.key === "Escape") setPrixEdite(null); }}
                        className="w-24 h-7 rounded-lg border border-secondary-600 px-2 text-xs font-semibold text-right focus:outline-none" />
                    ) : estGerant ? (
                      <button onClick={() => { setPrixEdite(item.format_id); setPrixSaisi(String(item.prix)); }}
                        title="Modifier le prix" className="text-xs text-gray-500 underline decoration-dotted underline-offset-2 hover:text-ink-900">
                        × {formatPrix(item.prix)}
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">× {formatPrix(item.prix)}</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="font-bold text-sm text-gray-800">{formatPrix(item.sous_total)}</span>
                  <button aria-label={`Retirer ${item.nom} du panier`} onClick={() => removeItem(item.format_id)}
                    className="p-2.5 -m-1.5 rounded-xl hover:bg-red-50 text-gray-400 hover:text-danger transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="border-t border-slate-200 p-4 flex flex-col gap-3">
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
                  <input type="number" inputMode="numeric" min="0" value={rendusSaisis[e] ?? String(rendus[e])} aria-label={`Casiers rendus : ${nomEmballage(e)}`}
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
            <span className="chiffre font-extrabold text-2xl text-ink-900">{formatPrix(total)}</span>
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
              <label className="text-[13px] font-medium text-gray-700 block mb-1.5">
                Montant payé maintenant
              </label>
              <div className="relative">
                <input type="number" inputMode="numeric" min="0" placeholder="0" value={montantPayeStr}
                  onChange={e => setMontantPayeStr(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold focus:outline-none focus:border-secondary pr-14" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-semibold">{symbole}</span>
              </div>
              {ancienSolde > 0 && (
                <div className="flex gap-2 mt-2">
                  <button type="button" onClick={() => setMontantPayeStr(String(total))}
                    className="flex-1 text-xs font-semibold py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50">Achat seul</button>
                  <button type="button" onClick={() => setMontantPayeStr(String(totalGeneral))}
                    className="flex-1 text-xs font-semibold py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50">Tout régler</button>
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
              <label className="text-[13px] font-medium text-gray-700 block mb-1.5">
                Montant reçu (optionnel)
              </label>
              <div className="relative">
                <input type="number" inputMode="numeric" min="0" placeholder={`Min. ${formatPrix(total)}`}
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
          <button onClick={() => setShowApercu(true)}
            className="w-full h-11 rounded-lg border border-slate-300 text-gray-700 font-semibold flex items-center justify-center gap-2 text-[14px] hover:bg-slate-50">
            <FileText size={16} /> Voir la facture avant de valider
          </button>
          <button onClick={() => validerVente()} disabled={validating}
            className="w-full h-12 bg-secondary-600 text-white font-semibold rounded-lg flex items-center justify-center gap-2 text-[15px] shadow-sm hover:bg-secondary-700 active:translate-y-px transition-colors disabled:opacity-60">
            <Check size={16} strokeWidth={2.5} />
            {validating ? "Validation…" : "Valider la vente"}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Bandeau caisse : titre, client et total en direct */}
      <div className="relative overflow-hidden bg-ink-900 text-white flex-shrink-0 px-4 sm:px-6 pb-4 sm:pb-5 pt-[calc(1rem+env(safe-area-inset-top))] sm:pt-[calc(1.5rem+env(safe-area-inset-top))]">
        <div className="pointer-events-none absolute -top-24 right-10 w-72 h-72 rounded-full bg-secondary-500/15 blur-3xl" />
        <div className="relative flex items-center gap-3 sm:gap-4">
          <span className="hidden sm:flex w-12 h-12 rounded-2xl bg-white/[0.07] text-secondary-400 items-center justify-center flex-shrink-0">
            <ShoppingCart size={22} />
          </span>
          <div className="flex-1 min-w-0">
            <h1 className="font-extrabold text-[20px] sm:text-[28px] leading-tight whitespace-nowrap">Nouvelle vente</h1>
            <div className="text-ink-300 text-[13px] mt-0.5 truncate">
              {selectedClient && selectedClient.est_defaut !== 1 ? <>Client : <span className="text-white font-semibold">{selectedClient.nom}</span></> : "Vente au comptoir"}
            </div>
          </div>
          {/* Afficheur de caisse */}
          <div className="text-right flex-shrink-0">
            <div className="text-[11px] uppercase tracking-[0.14em] text-ink-400">Total</div>
            <div className={["chiffre font-extrabold leading-none mt-1 text-[24px] sm:text-[34px]", items.length ? "text-secondary-400" : "text-white/40"].join(" ")}>
              {formatPrix(total)}
            </div>
            <div className="text-[11px] text-ink-400 mt-1">{casiers(items.reduce((t, i) => t + i.quantite, 0))}</div>
          </div>
          <button onClick={() => setShowCart(true)} aria-label="Voir le panier"
            className="lg:hidden relative w-11 h-11 rounded-xl bg-white/[0.08] hover:bg-white/15 flex items-center justify-center flex-shrink-0">
            <ShoppingCart size={19} />
            {items.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 bg-secondary-500 rounded-full text-[10px] font-bold flex items-center justify-center ring-2 ring-ink-900">
                {items.reduce((t, i) => t + i.quantite, 0)}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Produits */}
        <div ref={listeRef} className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-4 pb-40 lg:pb-6">
          {/* Sélection client */}
          <div className="relative">
            <label className="text-[13px] font-medium text-gray-700 block mb-1.5">Client</label>
            <button onClick={() => setShowClientDrop(!showClientDrop)}
              className={["w-full flex items-center gap-2.5 px-3.5 h-12 bg-white border rounded-xl text-[15px] shadow-sm transition-colors",
                showClientDrop ? "border-secondary-600 ring-2 ring-secondary/20" : "border-slate-300 hover:border-slate-400"].join(" ")}>
              <User size={15} className="text-gray-400 flex-shrink-0" />
              <span className="flex-1 text-left font-medium text-gray-800 truncate">
                {selectedClient?.nom ?? "Sélectionner un client"}
              </span>
              <ChevronDown size={14} className={["text-gray-400 transition-transform", showClientDrop ? "rotate-180" : ""].join(" ")} />
            </button>
            {showClientDrop && (
              <div className="absolute top-full mt-1 left-0 right-0 z-40 bg-white border border-slate-200 rounded-xl shadow-modal overflow-hidden">
                <div className="p-2 border-b border-slate-200">
                  <input autoFocus value={clientSearch} onChange={e => setClientSearch(e.target.value)}
                    placeholder="Rechercher…" className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-secondary" />
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {filteredClients.map(c => (
                    <button key={c.id} onClick={() => { setClient(c.id); setShowClientDrop(false); setClientSearch(""); }}
                      className={["w-full flex items-center gap-3 px-3 py-2.5 text-left border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors",
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

          {/* Recherche et familles : collées en haut pendant qu'on fait défiler les produits */}
          <div ref={rechercheRef} className="sticky -top-4 sm:-top-6 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-4 sm:pt-6 -mt-4 sm:-mt-6 pb-2 bg-background flex flex-col gap-2.5">
            <div className="relative">
              <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input type="search" inputMode="search" enterKeyHint="search" autoComplete="off" value={search}
                onChange={e => setSearch(e.target.value)}
                onFocus={() => setTimeout(montrerResultats, 250)}
                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                placeholder="Rechercher un produit (ex. : pils, 0,5)…" aria-label="Rechercher un produit"
                className="w-full h-12 pl-10 pr-11 bg-white border border-gray-300 rounded-xl text-[15px] focus:outline-none focus:border-secondary [&::-webkit-search-cancel-button]:hidden" />
              {search && (
                <button onClick={() => setSearch("")} aria-label="Effacer la recherche"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:bg-slate-100">
                  <X size={17} />
                </button>
              )}
            </div>
            {recherche ? (
              <div className="text-xs font-semibold text-gray-500 px-1">
                {nbResultats === 0 ? "Aucun produit trouvé" : `${nbResultats} résultat${nbResultats > 1 ? "s" : ""}`}
              </div>
            ) : groupes.length > 1 && (
              <Pastilles valeur={famille} onChange={setFamille} options={[
                { valeur: "toutes" as const, label: "Tout" },
                ...groupes.map(g => ({ valeur: g.cle, label: g.court, compte: g.items.length })),
              ]} />
            )}
          </div>

          {/* Grille produits */}
          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-white rounded-xl p-3 h-36 animate-pulse">
                  <div className="h-3 bg-gray-200 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-gray-200 rounded w-1/2 mb-4" />
                  <div className="h-7 bg-gray-200 rounded" />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {groupesAffiches.map(g => (
                <section key={g.cle}>
                  <h2 className="text-[12px] font-bold uppercase tracking-wide text-ink-600 mb-2.5 flex items-center gap-2">
                    {g.label}<span className="flex-1 h-px bg-slate-200" /><span className="text-gray-400 normal-case">{g.items.length}</span>
                  </h2>
                  <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                    {g.items.map(({ cle, produit, formats }) => (
                      <ProduitCard key={`${produit.id}-${cle}`} nom={produit.nom} formats={formats}
                        cartItems={items} onAdd={handleAddToCart} prixClient={prixClient} />
                    ))}
                  </div>
                </section>
              ))}
              {cartes.length === 0 && (
                <div className="text-center py-10 text-gray-400 text-sm flex flex-col items-center gap-3">
                  Aucun produit ne correspond à « {search} ».
                  <button onClick={() => setSearch("")} className="h-10 px-4 rounded-full bg-white border border-slate-300 text-gray-700 font-semibold">Effacer la recherche</button>
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
      {items.length > 0 && !showCart && !clavierOuvert && (
        <button onClick={() => setShowCart(true)}
          className="lg:hidden fixed left-3 right-3 z-30 bottom-[calc(84px+env(safe-area-inset-bottom))] h-14 px-4 rounded-2xl
            bg-secondary-600 text-white shadow-modal flex items-center gap-3 animate-slide-up active:scale-[0.98] transition-transform">
          <span className="relative">
            <ShoppingCart size={20} />
            <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 bg-white text-secondary-700 rounded-full text-[10px] font-bold flex items-center justify-center">
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
          <div className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-white rounded-t-3xl max-h-[88dvh] flex flex-col overflow-hidden shadow-modal animate-slide-up pb-safe">
            <div className="flex items-center justify-between px-4 pt-3 pb-1">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto" />
            </div>
            <button onClick={() => setShowCart(false)} className="absolute top-5 right-3 p-2 rounded-full hover:bg-slate-100" aria-label="Fermer le panier">
              <X size={16} className="text-gray-500" />
            </button>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
              {renderPanier(true)}
            </div>
          </div>
        </>
      )}

      {/* Aperçu de la facture, avant d'enregistrer */}
      {showApercu && items.length > 0 && (
        <ModalApercuFacture isOpen={showApercu} onClose={() => setShowApercu(false)} data={apercuFacture()} validating={validating}
          onValider={() => { setShowApercu(false); validerVente(); }} />
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
          <Input label="Téléphone" type="tel" value={rapideTel} onChange={e => setRapideTel(e.target.value)} placeholder="01 97 00 00 00" />
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
  // Format créé sans prix : visible mais pas encore vendable
  const sansPrix = prixDe(fmt) <= 0;
  const lowStock = !outOfStock && fmt.stock <= fmt.seuil_alerte;
  const inCart = cartItems.find(i => i.format_id === fmt.id);

  return (
    <div className={["relative bg-white rounded-xl p-3 sm:p-4 flex flex-col gap-2.5 shadow-card border transition-colors",
      outOfStock ? "border-slate-200 opacity-60" : inCart ? "border-secondary-600 ring-1 ring-secondary-600" : "border-slate-200 hover:border-slate-300"].join(" ")}>
      {inCart && (
        <span className="absolute -top-2 -right-2 min-w-[24px] h-6 px-1.5 rounded-full bg-secondary-600 text-white text-xs font-bold flex items-center justify-center ring-2 ring-white">
          {inCart.quantite}
        </span>
      )}

      <div className="flex items-center gap-2.5 min-w-0">
        <Avatar nom={nom} taille="md" />
        <div className="min-w-0">
        <div className="font-bold text-[15px] text-gray-900 truncate">{nom}</div>
        <div className={["text-xs font-medium mt-0.5",
          outOfStock ? "text-danger" : lowStock ? "text-amber-600" : "text-gray-400"].join(" ")}>
          {outOfStock ? "Rupture de stock" : `${casiers(fmt.stock)} en stock`}
        </div>
        </div>
      </div>

      {/* Formats : pastilles à toucher (liste déroulante seulement s'il y en a beaucoup) */}
      {formats.length > 1 && formats.length <= 3 && (
        <div className="flex flex-wrap gap-1">
          {formats.map((f, i) => (
            <button key={f.id} onClick={() => setFormatIdx(i)}
              className={["px-2 py-1 rounded-lg text-[11px] font-semibold border transition-colors",
                i === formatIdx ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-slate-300 hover:border-slate-400"].join(" ")}>
              {volumeFr(f.volume, f.unite, f.casier)}
            </button>
          ))}
        </div>
      )}
      {formats.length > 3 && (
        <select value={formatIdx} onChange={e => setFormatIdx(+e.target.value)}
          className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50 focus:outline-none focus:border-secondary">
          {formats.map((f, i) => (
            <option key={f.id} value={i}>{volumeFr(f.volume, f.unite, f.casier)} — {formatPrix(prixDe(f))}</option>
          ))}
        </select>
      )}
      {formats.length === 1 && (
        <span className="self-start px-2 py-0.5 rounded-lg bg-slate-100 text-[11px] font-semibold text-gray-600">{volumeFr(fmt.volume, fmt.unite, fmt.casier)}</span>
      )}

      <div className="mt-auto">
        {sansPrix
          ? <div className="text-[13px] font-bold text-amber-700 leading-tight">Prix à fixer</div>
          : <div className="chiffre text-[17px] font-extrabold text-ink-900 leading-tight">{formatPrix(prixDe(fmt))}</div>}
        {prixSpecifique && (
          <div className="text-[11px] text-gray-400">
            <span className="font-semibold text-secondary-700">prix du client</span>
          </div>
        )}
      </div>

      <button onClick={() => !outOfStock && !sansPrix && onAdd(fmt, nom)} disabled={outOfStock || sansPrix}
        className="w-full h-10 flex items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition-colors bg-secondary-600 text-white hover:bg-secondary-700 active:translate-y-px disabled:bg-slate-200 disabled:text-gray-400 disabled:cursor-not-allowed">
        {sansPrix ? "Pas encore en vente" : <><Plus size={15} strokeWidth={2.5} /> Ajouter</>}
      </button>
    </div>
  );
}
