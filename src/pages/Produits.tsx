import { useEffect, useState } from "react";
import { Plus, Search, Edit2, Trash2, ChevronDown, ChevronRight, TrendingUp, Package } from "lucide-react";
import Pastilles from "@/components/ui/Pastilles";
import EtatVide from "@/components/ui/EtatVide";
import { invoke } from "@/lib/db";
import { useToast } from "@/components/ui/Toast";
import { useAppStore } from "@/stores/appStore";
import Header from "@/components/layout/Header";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import Card from "@/components/ui/Card";
import ModalAjustementPrix from "@/components/prix/ModalAjustementPrix";
import { CASIER_PAR_VOLUME } from "@/lib/api/emballages";
import { volumeFr, casiers, sansAccent } from "@/lib/format";
import Avatar from "@/components/ui/Avatar";
import { useAuthStore } from "@/stores/authStore";
import { useCatalogue } from "@/stores/catalogueStore";
import { RAYONS, FAMILLES, familleDe, grouperParFamille, type Rayon, type CleFamille } from "@/lib/familles";

interface Format { casier?: number | null;
  id: string; produit_id: string; volume: number; unite: string;
  prix: number; stock: number; seuil_alerte: number; emballage_id?: string | null;
}
// Choix rapides du formulaire de format (le casier n'est proposé que s'il existe dans les paramètres)
const FORMATS_COURANTS: { libelle: string; volume: number; unite: string; emballage: string }[] = [
  { libelle: "0,33 L · casier de 24", volume: 0.33, unite: "L", emballage: "casier-24" },
  { libelle: "0,5 L · casier de 20", volume: 0.5, unite: "L", emballage: "casier-20" },
  { libelle: "0,5 L · casier de 12", volume: 0.5, unite: "L", emballage: "casier-12" },
  { libelle: "0,66 L · casier de 12", volume: 0.66, unite: "L", emballage: "casier-12" },
  { libelle: "Carton de 24 canettes", volume: 24, unite: "canette", emballage: "" },
];

type Preset = { volume: number; unite: string; emballage: string };
// Nouveau produit depuis une famille : rayon et format proposés d'office
const PRESETS_FAMILLE: Record<CleFamille, { rayon: "" | Rayon; format?: Preset }> = {
  "casier-12": { rayon: "", format: { volume: 0.66, unite: "L", emballage: "casier-12" } },
  "casier-20": { rayon: "", format: { volume: 0.5, unite: "L", emballage: "casier-20" } },
  "casier-24": { rayon: "", format: { volume: 0.33, unite: "L", emballage: "casier-24" } },
  eau: { rayon: "eau", format: { volume: 6, unite: "pack", emballage: "" } },
  pet: { rayon: "pet", format: { volume: 6, unite: "pack", emballage: "" } },
  canette: { rayon: "canette", format: { volume: 24, unite: "canette", emballage: "" } },
  autres: { rayon: "" },
};

interface Produit { id: string; nom: string; date_creation: string; rayon?: Rayon | null; }
interface ProduitAvecFormats { produit: Produit; formats: Format[]; }


function stockBadge(stock: number, seuil: number) {
  if (stock <= 0)       return <Badge variant="danger">Rupture</Badge>;
  if (stock <= seuil)   return <Badge variant="warning">{stock} en stock</Badge>;
  return <Badge variant="success">{stock} en stock</Badge>;
}

export default function Produits() {
  const { toast } = useToast();
  const formatPrix = useAppStore((s) => s.formatMontant);
  const estGerant = useAuthStore((s) => s.profil?.role === "gerant");
  // Catalogue partagé : en mémoire et à jour en direct (y compris juste après un ajout ou une modification)
  const catalogue = useCatalogue();
  const data = catalogue.produits as ProduitAvecFormats[];
  const loading = !catalogue.pret;
  const [search, setSearch] = useState("");
  // « tous », « alerte » ou une famille (Casier 12, Eaux…)
  const [filtre, setFiltre] = useState<string>("tous");
  const [familleNouveau, setFamilleNouveau] = useState<CleFamille | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Modal produit
  const [modalProduit, setModalProduit] = useState(false);
  const [editProduit, setEditProduit] = useState<Produit | null>(null);
  const [nomProduit, setNomProduit] = useState("");
  const [rayon, setRayon] = useState<"" | Rayon>("");
  const [saving, setSaving] = useState(false);
  const [modalPrix, setModalPrix] = useState(false);

  // Modal format
  const [modalFormat, setModalFormat] = useState(false);
  const [editFormat, setEditFormat] = useState<Format | null>(null);
  const [parentProduitId, setParentProduitId] = useState<string | null>(null);
  const [fVolume, setFVolume] = useState("");
  const [fUnite, setFUnite] = useState("L");
  const [fPrix, setFPrix] = useState("");
  const [fStock, setFStock] = useState("");
  const [fSeuil, setFSeuil] = useState("5");
  const [fEmballage, setFEmballage] = useState("");
  const emballages = catalogue.emballages;

  // Le catalogue se met à jour tout seul après chaque écriture : rien à recharger
  const load = async () => {};

  // Côté gérant : crée les casiers par défaut et complète les anciens formats (une fois)
  useEffect(() => { if (estGerant) invoke("get_emballages").catch(() => {}); }, [estGerant]);

  const enAlerte = (d: ProduitAvecFormats) => d.formats.some(f => f.stock <= f.seuil_alerte);
  const filtered = data.filter(d => sansAccent(d.produit.nom).includes(sansAccent(search)) && (filtre !== "alerte" || enAlerte(d)));
  // Un produit apparaît dans chaque famille où il a un format (Beaufort : casier 24, 20 et 12)
  const entrees = filtered.flatMap(d => {
    const famillesDuProduit = [...new Set(d.formats.map(f => familleDe(f.emballage_id, d.produit.rayon)))];
    return (famillesDuProduit.length ? famillesDuProduit : [familleDe(null, d.produit.rayon)]).map(famille => ({
      ...d, famille, formatsFamille: d.formats.filter(f => familleDe(f.emballage_id, d.produit.rayon) === famille),
    }));
  });
  // Pendant une recherche on cherche dans toutes les familles
  const familleChoisie = search.trim() ? null : FAMILLES.find(f => f.cle === filtre)?.cle ?? null;
  const groupes = familleChoisie
    ? [{ ...FAMILLES.find(f => f.cle === familleChoisie)!, items: entrees.filter(e => e.famille === familleChoisie) }]
    : grouperParFamille(entrees, e => e.famille);
  const parFamille = (cle: CleFamille) => entrees.filter(e => e.famille === cle).length;
  const nbFormats = data.reduce((s, d) => s + d.formats.length, 0);
  const stockTotal = data.reduce((s, d) => s + d.formats.reduce((t, f) => t + f.stock, 0), 0);
  const nbAlertes = data.filter(enAlerte).length;

  const toggleExpand = (id: string) => setExpanded(prev => {
    const s = new Set(prev);
    s.has(id) ? s.delete(id) : s.add(id);
    return s;
  });

  const openNewProduit = (famille?: CleFamille) => {
    setEditProduit(null); setNomProduit(""); setFamilleNouveau(famille ?? null);
    setRayon(famille ? PRESETS_FAMILLE[famille].rayon : ""); setModalProduit(true);
  };
  const openEditProduit = (p: Produit) => { setEditProduit(p); setNomProduit(p.nom); setRayon(p.rayon ?? ""); setModalProduit(true); };

  const saveProduit = async () => {
    if (!nomProduit.trim()) return;
    setSaving(true);
    let nouveauId: string | null = null;
    try {
      if (editProduit) await invoke("update_produit", { id: editProduit.id, nom: nomProduit.trim(), rayon });
      else nouveauId = await invoke<string>("create_produit", { nom: nomProduit.trim(), rayon });
      toast(editProduit ? "Produit mis à jour" : "Produit créé : ajoutez son format", "success");
      setModalProduit(false);
      await load();
      // Enchaîne sur le format, déjà réglé pour la famille choisie
      if (nouveauId) openNewFormat(nouveauId, familleNouveau ? PRESETS_FAMILLE[familleNouveau].format : undefined);
    } catch (e) { toast(String(e), "error"); }
    setSaving(false);
  };

  const deleteProduit = async (p: Produit) => {
    if (!confirm(`Supprimer définitivement « ${p.nom} » et tous ses formats ?\n\nSon stock disparaît avec lui. Les ventes passées restent dans l'historique.`)) return;
    try {
      await invoke("delete_produit", { id: p.id });
      toast("Produit supprimé", "success");
      await load();
    } catch (e) { toast(String(e), "error"); }
  };

  const openNewFormat = (produitId: string, preset?: Preset) => {
    setEditFormat(null); setParentProduitId(produitId);
    setFVolume(preset ? String(preset.volume) : ""); setFUnite(preset?.unite ?? "L"); setFEmballage(preset?.emballage ?? "");
    setFPrix(""); setFStock("0"); setFSeuil("5");
    setModalFormat(true);
  };
  const openEditFormat = (f: Format) => {
    setEditFormat(f); setParentProduitId(f.produit_id);
    setFVolume(String(f.volume)); setFUnite(f.unite);
    setFPrix(String(f.prix)); setFStock(String(f.stock)); setFSeuil(String(f.seuil_alerte));
    setFEmballage(f.emballage_id ?? "");
    setModalFormat(true);
  };

  const saveFormat = async () => {
    setSaving(true);
    try {
      if (editFormat) {
        await invoke("update_format", { id: editFormat.id, volume: parseFloat(fVolume), unite: fUnite, prix: parseFloat(fPrix), seuilAlerte: parseInt(fSeuil), emballageId: fEmballage || null });
      } else {
        await invoke("create_format", {
          produitId: parentProduitId,
          volume: parseFloat(fVolume),
          unite: fUnite,
          prix: parseFloat(fPrix),
          stock: parseInt(fStock),
          seuilAlerte: parseInt(fSeuil),
          emballageId: fEmballage || null,
        });
      }
      toast(editFormat ? "Format mis à jour" : "Format ajouté", "success");
      setModalFormat(false);
      await load();
    } catch (e) { toast(String(e), "error"); }
    setSaving(false);
  };

  const deleteFormat = async (f: Format) => {
    const libelle = volumeFr(f.volume, f.unite, f.casier);
    if (!confirm(`Supprimer définitivement le format ${libelle}${f.stock > 0 ? ` (${f.stock} en stock)` : ""} ?\n\nLes ventes passées restent dans l'historique.`)) return;
    try {
      await invoke("delete_format", { id: f.id });
      toast(`Format ${libelle} supprimé`, "success");
      await load();
    } catch (e) { toast(String(e), "error"); }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Produits" subtitle="Catalogue, formats, prix et stock" icone={<Package size={22} />}
        chiffres={loading ? undefined : [
          { label: "Produits", valeur: data.length },
          { label: "Formats", valeur: nbFormats },
          { label: "Casiers en stock", valeur: stockTotal },
          { label: "En alerte", valeur: nbAlertes, ton: nbAlertes > 0 ? "danger" : "succes" },
        ]}
        actions={estGerant ? (
          <div className="flex gap-2">
            <Button variant="secondary" icon={<TrendingUp size={16} />} onClick={() => setModalPrix(true)}>Ajuster les prix</Button>
            <Button icon={<Plus size={16} />} onClick={() => openNewProduit()}>Nouveau produit</Button>
          </div>
        ) : undefined} />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-28 lg:pb-8 [&>*]:w-full [&>*]:max-w-4xl [&>*]:mx-auto [&>*]:flex-shrink-0 flex flex-col gap-3">
        <Input placeholder="Rechercher un produit…" value={search} onChange={e => setSearch(e.target.value)}
          icon={<Search size={16} />} />

        <Pastilles valeur={filtre} onChange={setFiltre} options={[
          { valeur: "tous", label: "Tous", compte: data.length },
          { valeur: "alerte", label: "En alerte", compte: nbAlertes },
          // Familles vides proposées au gérant pour y créer un premier produit (ex. Canettes)
          ...FAMILLES.filter(f => parFamille(f.cle) > 0 || (estGerant && f.cle !== "autres"))
            .map(f => ({ valeur: f.cle as string, label: f.court, compte: parFamille(f.cle) })),
        ]} />

        {loading ? (
          <Skeleton variant="card" count={3} />
        ) : filtered.length === 0 && !familleChoisie ? (
          <EtatVide icone={<Package size={26} />}
            titre={search ? `Aucun résultat pour « ${search} »` : filtre === "alerte" ? "Aucun produit en alerte" : "Aucun produit"}
            texte={search ? "Vérifiez l'orthographe." : filtre === "alerte" ? "Tous les stocks sont au-dessus de leur seuil." : "Ajoutez vos boissons et leurs formats (0,33 L, 0,5 L…)."}
            action={!search && filtre === "tous" && estGerant ? <Button icon={<Plus size={16} />} onClick={() => openNewProduit()}>Nouveau produit</Button> : undefined} />
        ) : (
          groupes.map(groupe => (
          <section key={groupe.cle} className="flex flex-col gap-2">
            <div className="flex items-center gap-2 px-1 pt-1">
              <h2 className="text-[13px] font-bold uppercase tracking-wide text-ink-600 flex-1">{groupe.label}</h2>
              {estGerant && (
                <button onClick={() => openNewProduit(groupe.cle)}
                  className="flex items-center gap-1 h-9 px-3 rounded-full text-[13px] font-semibold text-secondary-700 bg-secondary-50 hover:bg-secondary-100">
                  <Plus size={14} /> Nouveau produit
                </button>
              )}
            </div>
            {groupe.items.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-300 py-6 text-center text-sm text-gray-400">
                Aucun produit dans cette famille pour l'instant.
              </div>
            )}
            {groupe.items.map(({ produit, formatsFamille: formats, famille }) => {
            const cle = `${famille}:${produit.id}`;
            const isOpen = expanded.has(cle);
            const totalStock = formats.reduce((s, f) => s + f.stock, 0);
            const hasAlerte = formats.some(f => f.stock <= f.seuil_alerte);
            return (
              <Card key={cle} padding="none" className="overflow-hidden">
                {/* Produit row */}
                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => toggleExpand(cle)}>
                  <span className="text-gray-400" aria-hidden>
                    {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </span>
                  <Avatar nom={produit.nom} taille="md" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-800">{produit.nom}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{formats.length} format{formats.length > 1 ? "s" : ""} · {casiers(totalStock)} en stock</div>
                  </div>
                  {hasAlerte && <Badge variant="danger">Alerte</Badge>}
                  {estGerant && <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <button onClick={() => openEditProduit(produit)} className="p-2.5 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-primary transition-colors">
                      <Edit2 size={15} />
                    </button>
                    <button onClick={() => deleteProduit(produit)} className="p-2.5 rounded-xl hover:bg-red-50 text-gray-400 hover:text-danger transition-colors">
                      <Trash2 size={15} />
                    </button>
                  </div>}
                </div>

                {/* Formats */}
                {isOpen && (
                  <div className="border-t border-slate-200">
                    {formats.map(f => (
                      <div key={f.id} className="flex items-center gap-3 pl-11 pr-4 py-3 border-b border-slate-100 last:border-0">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="text-sm font-semibold text-gray-800">{volumeFr(f.volume, f.unite, f.casier)}</span>
                            {f.prix > 0
                              ? <span className="text-sm text-primary-700 font-semibold tabular-nums">{formatPrix(f.prix)}</span>
                              : <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">Prix à fixer</span>}
                          </div>
                          <div className={["text-xs mt-0.5 truncate", f.emballage_id ? "text-gray-400" : "text-orange-600"].join(" ")}>
                            {emballages.find(e => e.id === f.emballage_id)?.nom ?? "Sans casier consigné"}
                          </div>
                        </div>
                        {stockBadge(f.stock, f.seuil_alerte)}
                        {estGerant && (
                          <div className="flex items-center">
                            <button onClick={() => openEditFormat(f)} aria-label="Modifier le format"
                              className="p-2.5 rounded-xl hover:bg-slate-100 text-gray-400 hover:text-primary transition-colors">
                              <Edit2 size={14} />
                            </button>
                            <button onClick={() => deleteFormat(f)} aria-label="Supprimer le format"
                              className="p-2.5 rounded-xl hover:bg-red-50 text-gray-400 hover:text-danger transition-colors">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                    {estGerant && (
                      <button onClick={() => openNewFormat(produit.id, PRESETS_FAMILLE[famille].format)}
                        className="w-full flex items-center gap-2 pl-11 pr-4 py-3 text-sm text-secondary-700 font-semibold hover:bg-secondary-50 transition-colors">
                        <Plus size={15} /> Ajouter un format
                      </button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
          </section>
          ))
        )}
      </div>

      {/* Modal Produit */}
      <Modal isOpen={modalProduit} onClose={() => setModalProduit(false)} title={editProduit ? "Modifier le produit" : "Nouveau produit"}>
        <div className="p-6 flex flex-col gap-4">
          <Input label="Nom du produit" value={nomProduit} onChange={e => setNomProduit(e.target.value)}
            placeholder="ex. : Coca-Cola" />
          <div>
            <label className="text-[13px] font-medium text-gray-700 block mb-1.5">Rayon</label>
            <select value={rayon} onChange={e => setRayon(e.target.value as "" | Rayon)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-secondary">
              {RAYONS.map(r => <option key={r.valeur} value={r.valeur}>{r.label}</option>)}
            </select>
            <p className="text-xs text-gray-400 mt-1">Sert à classer les prix : casiers de 12, 20, 24, puis eaux et PET.</p>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setModalProduit(false)}>Annuler</Button>
            <Button onClick={saveProduit} loading={saving}>{editProduit ? "Mettre à jour" : "Créer"}</Button>
          </div>
        </div>
      </Modal>

      {/* Modal Format */}
      <Modal isOpen={modalFormat} onClose={() => setModalFormat(false)} title={editFormat ? "Modifier le format" : "Nouveau format"}>
        <div className="p-6 flex flex-col gap-4">
          {/* Formats courants du dépôt : volume, unité et casier en un geste */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-gray-700">Format courant</span>
            <div className="flex flex-wrap gap-1.5">
              {FORMATS_COURANTS.filter(c => !c.emballage || emballages.some(em => em.id === c.emballage)).map(c => {
                const actif = parseFloat(fVolume) === c.volume && fUnite === c.unite && (fEmballage || "") === c.emballage;
                return (
                  <button key={c.libelle} type="button" onClick={() => { setFVolume(String(c.volume)); setFUnite(c.unite); setFEmballage(c.emballage); }}
                    className={["px-3 h-9 rounded-full text-[13px] font-semibold border", actif ? "bg-ink-900 text-white border-ink-900" : "bg-white text-gray-700 border-slate-300 hover:border-secondary"].join(" ")}>
                    {c.libelle}
                  </button>
                );
              })}
            </div>
          </div>
          {(
            <div className="flex gap-2">
              <div className="flex-1">
                <Input label={fUnite === "pack" ? "Bouteilles par pack" : fUnite === "canette" ? "Canettes par carton" : "Volume"} type="number" step="0.01" value={fVolume} placeholder={fUnite === "pack" ? "ex. : 6 (1 = pack)" : fUnite === "canette" ? "ex. : 24 (1 = à l'unité)" : "ex. : 0.33"}
                  onChange={e => {
                    setFVolume(e.target.value);
                    // Suggère le casier habituel pour ce volume
                    const suggestion = CASIER_PAR_VOLUME[parseFloat(e.target.value)];
                    if (suggestion && emballages.some(em => em.id === suggestion)) setFEmballage(suggestion);
                  }} />
              </div>
              <div className="w-24">
                <label className="text-[13px] font-medium text-gray-700 block mb-1.5">Unité</label>
                <select value={fUnite} onChange={e => { setFUnite(e.target.value); if (e.target.value === "canette") setFEmballage(""); }}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:border-secondary">
                  <option>L</option><option>cL</option><option>mL</option><option value="pack">pack</option><option value="canette">canette</option><option>kg</option><option>g</option>
                </select>
              </div>
            </div>
          )}
          <Input label={fUnite === "pack" ? "Prix comptoir du pack" : fUnite === "canette" ? (parseFloat(fVolume) > 1 ? "Prix comptoir du carton" : "Prix comptoir de la canette") : "Prix comptoir du casier"} type="number" value={fPrix} onChange={e => setFPrix(e.target.value)} placeholder="ex. : 6000" />
          {!editFormat && (
            <Input label="Stock initial (casiers)" type="number" value={fStock} onChange={e => setFStock(e.target.value)} placeholder="0" />
          )}
          <div>
            <label className="text-[13px] font-medium text-gray-700 block mb-1.5">Emballage consigné</label>
            <select value={fEmballage} onChange={e => setFEmballage(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-secondary">
              <option value="">Aucun (pas de casier à rendre)</option>
              {emballages.map(em => <option key={em.id} value={em.id}>{em.nom}</option>)}
            </select>
          </div>
          <Input label="Seuil d'alerte" type="number" value={fSeuil} onChange={e => setFSeuil(e.target.value)} placeholder="5" />
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setModalFormat(false)}>Annuler</Button>
            <Button onClick={saveFormat} loading={saving}>{editFormat ? "Mettre à jour" : "Ajouter"}</Button>
          </div>
        </div>
      </Modal>

      <ModalAjustementPrix isOpen={modalPrix} onClose={() => setModalPrix(false)} onApplied={load} />
    </div>
  );
}
