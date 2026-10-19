import { useEffect, useMemo, useState } from "react";
import { ScrollText, Tag, Package, Boxes, Users, Truck, ShoppingCart, Wallet, UserCog, Settings, RotateCcw, Search, CheckCircle2 } from "lucide-react";
import { invoke } from "@/lib/db";
import { useToast } from "@/components/ui/Toast";
import Header from "@/components/layout/Header";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Skeleton from "@/components/ui/Skeleton";
import EtatVide from "@/components/ui/EtatVide";
import Pastilles from "@/components/ui/Pastilles";
import { usePeut } from "@/lib/droits";
import { sansAccent } from "@/lib/format";
import type { Categorie, EntreeJournal } from "@/lib/api/journal";

const CATEGORIES: { cle: Categorie; label: string; icone: React.ReactNode }[] = [
  { cle: "prix", label: "Prix", icone: <Tag size={15} /> },
  { cle: "catalogue", label: "Produits", icone: <Package size={15} /> },
  { cle: "stock", label: "Stock", icone: <Boxes size={15} /> },
  { cle: "clients", label: "Clients", icone: <Users size={15} /> },
  { cle: "fournisseurs", label: "Fournisseurs", icone: <Truck size={15} /> },
  { cle: "ventes", label: "Ventes", icone: <ShoppingCart size={15} /> },
  { cle: "comptes", label: "Paiements", icone: <Wallet size={15} /> },
  { cle: "utilisateurs", label: "Comptes", icone: <UserCog size={15} /> },
  { cle: "parametres", label: "Paramètres", icone: <Settings size={15} /> },
];

const jour = (d: string) => d.slice(0, 10);
function titreJour(j: string) {
  const auj = new Date(); const p = (n: number) => String(n).padStart(2, "0");
  const cle = (d: Date) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  const hier = new Date(auj.getTime() - 86400000);
  if (j === cle(auj)) return "Aujourd'hui";
  if (j === cle(hier)) return "Hier";
  return new Date(`${j}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

/** Journal des actions : qui a fait quoi, avec retour en arrière pour l'admin. */
export default function Journal() {
  const { toast } = useToast();
  const peutRestaurer = usePeut("parametres");
  const [entrees, setEntrees] = useState<EntreeJournal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState<string>("tout");
  const [recherche, setRecherche] = useState("");
  const [enCours, setEnCours] = useState<string | null>(null);
  const [ouvertes, setOuvertes] = useState<Set<string>>(new Set());

  const load = async () => {
    try { setEntrees(await invoke<EntreeJournal[]>("get_journal", {})); }
    catch (e) { toast(String(e), "error"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const visibles = useMemo(() => {
    const t = sansAccent(recherche);
    return entrees.filter(e => (filtre === "tout" || e.categorie === filtre)
      && (!t || sansAccent(`${e.libelle} ${e.details.join(" ")} ${e.utilisateur_nom}`).includes(t)));
  }, [entrees, filtre, recherche]);
  const parJour = useMemo(() => {
    const m = new Map<string, EntreeJournal[]>();
    for (const e of visibles) m.set(jour(e.date), [...(m.get(jour(e.date)) ?? []), e]);
    return [...m];
  }, [visibles]);

  const restaurer = async (e: EntreeJournal) => {
    const lignes = e.details.slice(0, 6).join("\n");
    const avert = e.restauration?.avertissement ? `\n\n${e.restauration.avertissement}` : "";
    if (!confirm(`Restaurer : ${e.libelle} ?\n\n${lignes}${avert}\n\nLes choses reviennent comme avant cette action.`)) return;
    setEnCours(e.id);
    try {
      await invoke("restaurer_action", { id: e.id });
      toast("Action restaurée", "success");
      await load();
    } catch (err) { toast(String(err), "error"); }
    setEnCours(null);
  };

  const presentes = new Set(entrees.map(e => e.categorie));
  const icone = (c: Categorie) => CATEGORIES.find(x => x.cle === c)?.icone ?? <ScrollText size={15} />;
  const heure = (d: string) => d.slice(11, 16);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Journal des actions" subtitle="Qui a fait quoi, et retour en arrière si besoin" icone={<ScrollText size={22} />}
        chiffres={loading ? undefined : [
          { label: "Actions notées", valeur: entrees.length },
          { label: "Aujourd'hui", valeur: entrees.filter(e => titreJour(jour(e.date)) === "Aujourd'hui").length },
          { label: "Restaurées", valeur: entrees.filter(e => e.restaure_le).length },
        ]} />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-28 lg:pb-8 [&>*]:w-full [&>*]:max-w-4xl [&>*]:mx-auto [&>*]:flex-shrink-0 flex flex-col gap-3">
        <Input placeholder="Chercher (produit, client, personne…)" value={recherche} onChange={e => setRecherche(e.target.value)} icon={<Search size={16} />} />
        <Pastilles valeur={filtre} onChange={setFiltre} options={[
          { valeur: "tout", label: "Tout", compte: entrees.length },
          ...CATEGORIES.filter(c => presentes.has(c.cle)).map(c => ({ valeur: c.cle as string, label: c.label, compte: entrees.filter(e => e.categorie === c.cle).length })),
        ]} />

        {loading ? <Skeleton variant="card" count={4} /> : visibles.length === 0 ? (
          <EtatVide icone={<ScrollText size={26} />} titre={entrees.length ? "Aucune action ne correspond" : "Aucune action notée pour l'instant"}
            texte="Les changements de prix, de produits, de clients, de stock et les suppressions apparaîtront ici." />
        ) : parJour.map(([j, liste]) => (
          <section key={j} className="flex flex-col gap-2">
            <h2 className="text-[13px] font-bold uppercase tracking-wide text-ink-600 px-1 first-letter:uppercase">{titreJour(j)}</h2>
            <Card padding="none" className="overflow-hidden divide-y divide-slate-100">
              {liste.map(e => {
                const ouverte = ouvertes.has(e.id);
                const details = ouverte ? e.details : e.details.slice(0, 3);
                return (
                  <div key={e.id} className={["px-4 py-3 flex gap-3", e.restaure_le ? "bg-slate-50/70" : ""].join(" ")}>
                    <span className="w-8 h-8 rounded-lg bg-slate-100 text-gray-600 flex items-center justify-center flex-shrink-0 mt-0.5">{icone(e.categorie)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-900">{e.libelle}</div>
                      {details.map((d, i) => <div key={i} className="text-xs text-gray-600 mt-0.5 break-words">{d}</div>)}
                      {e.details.length > 3 && (
                        <button onClick={() => setOuvertes(s => { const n = new Set(s); n.has(e.id) ? n.delete(e.id) : n.add(e.id); return n; })}
                          className="text-xs font-semibold text-secondary-700 mt-1 py-1">{ouverte ? "Voir moins" : `Voir les ${e.details.length} lignes`}</button>
                      )}
                      <div className="text-[11px] text-gray-400 mt-1">{heure(e.date)} · {e.utilisateur_nom || "?"}</div>
                      {e.restaure_le && (
                        <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                          <CheckCircle2 size={11} /> Restauré le {e.restaure_le.slice(8, 10)}/{e.restaure_le.slice(5, 7)} à {e.restaure_le.slice(11, 16)} par {e.restaure_par}
                        </div>
                      )}
                    </div>
                    {peutRestaurer && e.restauration && !e.restaure_le && (
                      <button onClick={() => restaurer(e)} disabled={enCours === e.id}
                        className="self-start flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold text-gray-700 border border-slate-300 hover:bg-slate-50 flex-shrink-0 disabled:opacity-50">
                        <RotateCcw size={13} /> {enCours === e.id ? "…" : "Restaurer"}
                      </button>
                    )}
                  </div>
                );
              })}
            </Card>
          </section>
        ))}
        {!loading && entrees.length >= 300 && <p className="text-center text-xs text-gray-400">Les 300 dernières actions sont affichées.</p>}
      </div>
    </div>
  );
}
