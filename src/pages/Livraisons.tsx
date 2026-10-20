import { useEffect, useState } from "react";
import { PackageCheck, Check, Truck, FileText } from "lucide-react";
import Header from "@/components/layout/Header";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Pastilles from "@/components/ui/Pastilles";
import EtatVide from "@/components/ui/EtatVide";
import Skeleton from "@/components/ui/Skeleton";
import Modal from "@/components/ui/Modal";
import { FactureHTML } from "@/components/facture/FactureHTML";
import { type FactureData } from "@/components/facture/FacturePDF";
import { useToast } from "@/components/ui/Toast";
import { useAppStore } from "@/stores/appStore";
import { invoke } from "@/lib/db";
import { prepareVenteData, printFacture, type ParametresRaw } from "@/lib/pdf";
import { useTempsReel } from "@/lib/tempsReel";
import { casiers } from "@/lib/format";

interface Livraison {
  id: string; numero_facture: string; date: string; client_id: string; client_nom: string | null;
  total: number; montant_recu: number | null; monnaie_rendue: number | null; statut: string;
  reste_du: number; regle_apres: number;
  emballages_livres: Record<string, number>; emballages_rendus: Record<string, number>;
  rendus_apres: Record<string, number>;
  solde_avant: { argent: number; emballages: Record<string, number> } | null;
  livraison: { statut: string; livreurs: string[] };
  vendeur_nom?: string;
}
interface DetailVente { id: string; vente_id: string; format_id: string; produit_nom: string | null; volume: number | null; unite: string | null; casier?: number | null; quantite: number; prix_utilise: number }
interface ClientSolde { id: string; solde_argent?: number; telephone?: string | null }
/** Ce que l'on note au retour du livreur, pour une livraison */
interface Saisie { montant: string; casiers: Record<string, string> }
interface Cloture { numero: string; client: string; montant: number; casiers: Record<string, number> }

const resteFacture = (l: Livraison) => Math.max(0, l.reste_du - l.regle_apres);
const casiersFacture = (l: Livraison) => Object.fromEntries(Object.entries(l.emballages_livres)
  .map(([e, n]) => [e, Math.max(0, n - (l.emballages_rendus[e] ?? 0) - (l.rendus_apres[e] ?? 0))] as const)
  .filter(([, n]) => n > 0));
/** Ce qui est écrit sur la facture : achat + ancienne dette, sans dépasser ce que le client doit aujourd'hui */
const attendu = (l: Livraison, solde: number | undefined) => {
  const imprime = resteFacture(l) + Math.max(0, l.solde_avant?.argent ?? 0);
  return Math.min(imprime, Math.max(resteFacture(l), solde ?? imprime));
};
const joursDepuis = (d: string) => Math.floor((Date.now() - new Date(d.replace(" ", "T")).getTime()) / 86_400_000);
const heure = (d: string) => new Date(d.replace(" ", "T")).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function Livraisons() {
  const { toast } = useToast();
  const { symbole, position, formatMontant: formatPrix } = useAppStore();
  const [livraisons, setLivraisons] = useState<Livraison[]>([]);
  const [soldes, setSoldes] = useState<Record<string, ClientSolde>>({});
  const [noms, setNoms] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [livreur, setLivreur] = useState("tous");
  const [saisies, setSaisies] = useState<Record<string, Saisie>>({});
  const [enCours, setEnCours] = useState<string | null>(null);
  const [clotures, setClotures] = useState<Cloture[]>([]);
  const [parametres, setParametres] = useState<ParametresRaw | null>(null);
  const [facture, setFacture] = useState<FactureData | null>(null);

  const charger = async (silencieux = false) => {
    if (!silencieux) setLoading(true);
    try {
      const [ls, cs] = await Promise.all([
        invoke<Livraison[]>("get_livraisons"),
        invoke<ClientSolde[]>("get_clients").catch(() => [] as ClientSolde[]),
      ]);
      const parId = Object.fromEntries(cs.map(c => [c.id, c]));
      setSoldes(parId);
      setLivraisons(ls);
      // Pré-rempli avec « tout reçu » : dans la plupart des cas il suffit de clôturer
      setSaisies(prev => {
        const suivant: Record<string, Saisie> = {};
        for (const l of ls) suivant[l.id] = prev[l.id] ?? {
          montant: String(attendu(l, parId[l.client_id]?.solde_argent)),
          casiers: Object.fromEntries(Object.entries(casiersFacture(l)).map(([e, n]) => [e, String(n)])),
        };
        return suivant;
      });
    } catch (e) { toast(e instanceof Error ? e.message : String(e), "error"); }
    setLoading(false);
  };

  useEffect(() => {
    charger();
    invoke<ParametresRaw>("get_parametres").then(setParametres).catch(() => {});
    invoke<{ id: string; nom: string }[]>("get_emballages")
      .then(l => setNoms(Object.fromEntries(l.map(e => [e.id, e.nom])))).catch(() => {});
  }, []);
  // Une livraison créée ou clôturée sur un autre appareil
  useTempsReel(["ventes_du_jour"], () => { charger(true); });

  const nomEmballage = (e: string) => noms[e] ?? "Casiers";
  const tousLivreurs = [...new Set(livraisons.flatMap(l => l.livraison.livreurs))].sort((a, b) => a.localeCompare(b, "fr"));
  const affichees = livraisons.filter(l => livreur === "tous" || l.livraison.livreurs.includes(livreur));

  const valeurs = (l: Livraison) => {
    const s = saisies[l.id];
    return {
      montant: Math.max(0, parseFloat(s?.montant ?? "0") || 0),
      casiers: Object.fromEntries(Object.entries(s?.casiers ?? {}).map(([e, n]) => [e, Math.max(0, parseInt(n) || 0)])),
    };
  };
  const totalArgent = affichees.reduce((t, l) => t + valeurs(l).montant, 0);
  const totalCasiers = (c: Record<string, number>) => Object.values(c).reduce((t, n) => t + n, 0);
  const casiersAttendus = affichees.reduce((t, l) => t + totalCasiers(valeurs(l).casiers), 0);

  const cloturer = async (l: Livraison) => {
    const v = valeurs(l);
    await invoke("cloturer_livraison", { venteId: l.id, montant: v.montant, emballages: v.casiers });
    setClotures(c => [...c, { numero: l.numero_facture, client: l.client_nom ?? "Client", montant: v.montant, casiers: v.casiers }]);
    setLivraisons(ls => ls.filter(x => x.id !== l.id));
  };

  const cloturerUne = async (l: Livraison) => {
    setEnCours(l.id);
    try { await cloturer(l); toast(`${l.client_nom} : livraison clôturée`, "success"); }
    catch (e) { toast(e instanceof Error ? e.message : String(e), "error"); }
    setEnCours(null);
  };

  const cloturerTout = async () => {
    if (!confirm(`Clôturer ${affichees.length} livraison${affichees.length > 1 ? "s" : ""} ?\nArgent reçu : ${formatPrix(totalArgent)}\nCasiers vides : ${casiersAttendus}`)) return;
    setEnCours("tout");
    let ok = 0;
    for (const l of affichees) {
      try { await cloturer(l); ok++; }
      catch (e) { toast(`${l.client_nom} : ${e instanceof Error ? e.message : String(e)}`, "error"); }
    }
    if (ok) toast(`${ok} livraison${ok > 1 ? "s" : ""} clôturée${ok > 1 ? "s" : ""}`, "success");
    setEnCours(null);
  };

  const voirFacture = async (l: Livraison) => {
    if (!parametres) return;
    const data = await invoke<{ vente: Livraison; details: DetailVente[] }>("get_vente_details", { venteId: l.id });
    setFacture(prepareVenteData(data.vente, data.details,
      { id: l.client_id, nom: l.client_nom ?? "Client", telephone: soldes[l.client_id]?.telephone ?? null },
      parametres, { symbole, position }, nomEmballage));
  };

  const majSaisie = (id: string, champ: Partial<Saisie>) => setSaisies(s => ({ ...s, [id]: { ...s[id], ...champ } }));

  // Récapitulatif de ce qui a été clôturé ici : ce que le livreur remet et ce qu'on décharge
  const recapArgent = clotures.reduce((t, c) => t + c.montant, 0);
  const recapCasiers: Record<string, number> = {};
  for (const c of clotures) for (const [e, n] of Object.entries(c.casiers)) if (n > 0) recapCasiers[e] = (recapCasiers[e] ?? 0) + n;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Livraisons" subtitle="Au retour du livreur : l'argent et les casiers remis" icone={<PackageCheck size={22} />}
        chiffres={loading ? undefined : [
          { label: "En cours", valeur: livraisons.length, ton: livraisons.length > 0 ? "alerte" : "neutre" },
          { label: "Argent attendu", valeur: formatPrix(livraisons.reduce((t, l) => t + attendu(l, soldes[l.client_id]?.solde_argent), 0)) },
        ]} />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-40 lg:pb-28 [&>*]:w-full [&>*]:max-w-4xl [&>*]:mx-auto [&>*]:flex-shrink-0 flex flex-col gap-3">
        {clotures.length > 0 && (
          <Card className="flex flex-col gap-2 border-emerald-200 bg-emerald-50">
            <div className="text-[13px] font-bold uppercase tracking-wide text-emerald-800">Clôturé ici · {clotures.length} livraison{clotures.length > 1 ? "s" : ""}</div>
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-emerald-900">Argent que le livreur remet</span>
              <span className="chiffre text-xl font-extrabold text-emerald-800">{formatPrix(recapArgent)}</span>
            </div>
            {Object.entries(recapCasiers).map(([e, n]) => (
              <div key={e} className="flex justify-between text-sm text-emerald-900"><span>{nomEmballage(e)} vides à décharger</span><strong>{n}</strong></div>
            ))}
            <Button variant="secondary" size="sm" onClick={() => setClotures([])} className="self-start">Effacer ce récapitulatif</Button>
          </Card>
        )}

        {tousLivreurs.length > 1 && (
          <Pastilles valeur={livreur} onChange={setLivreur} options={[
            { valeur: "tous", label: "Tous", compte: livraisons.length },
            ...tousLivreurs.map(n => ({ valeur: n, label: n, compte: livraisons.filter(l => l.livraison.livreurs.includes(n)).length })),
          ]} />
        )}

        {loading ? <Skeleton variant="card" count={3} /> : affichees.length === 0 ? (
          <EtatVide icone={<Truck size={26} />} titre="Aucune livraison en cours"
            texte="Une vente faite avec « Livrer » apparaît ici jusqu'au retour du livreur." />
        ) : affichees.map(l => {
          const s = saisies[l.id];
          const dus = casiersFacture(l);
          const anciens = Math.max(0, l.solde_avant?.argent ?? 0);
          const vieux = joursDepuis(l.date);
          const recu = valeurs(l).montant;
          const attendus = attendu(l, soldes[l.client_id]?.solde_argent);
          return (
            <Card key={l.id} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold text-gray-900 truncate">{l.client_nom}</div>
                  <div className="text-xs text-gray-500"><span className="font-mono">{l.numero_facture}</span> · {heure(l.date)}</div>
                  <div className="text-xs text-gray-600 mt-0.5 flex items-center gap-1"><Truck size={12} /> {l.livraison.livreurs.join(", ")}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-[11px] uppercase tracking-wide text-gray-500">À encaisser</div>
                  <div className="chiffre font-extrabold text-ink-900">{formatPrix(attendus)}</div>
                  {vieux >= 1 && <div className="text-[11px] font-semibold text-orange-600">depuis {vieux} jour{vieux > 1 ? "s" : ""}</div>}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-bold uppercase tracking-wide text-ink-600">Argent reçu</label>
                <div className="relative">
                  <input type="number" inputMode="numeric" min="0" value={s?.montant ?? ""} onFocus={e => e.target.select()}
                    onChange={e => majSaisie(l.id, { montant: e.target.value })} aria-label={`Argent reçu de ${l.client_nom}`}
                    className="w-full h-12 rounded-xl border border-slate-300 px-4 pr-16 text-lg font-bold focus:outline-none focus:border-secondary" />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-semibold">{symbole}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => majSaisie(l.id, { montant: String(attendus) })}
                    className="h-9 px-3 rounded-full text-[13px] font-semibold border bg-white text-gray-700 border-slate-300">Tout ({formatPrix(attendus)})</button>
                  {anciens > 0 && attendus > resteFacture(l) && (
                    <button type="button" onClick={() => majSaisie(l.id, { montant: String(resteFacture(l)) })}
                      className="h-9 px-3 rounded-full text-[13px] font-semibold border bg-white text-gray-700 border-slate-300">Achat seul ({formatPrix(resteFacture(l))})</button>
                  )}
                  <button type="button" onClick={() => majSaisie(l.id, { montant: "0" })}
                    className="h-9 px-3 rounded-full text-[13px] font-semibold border bg-white text-gray-700 border-slate-300">Rien</button>
                </div>
                {recu < attendus && <div className="text-xs font-semibold text-orange-700">Restera dû : {formatPrix(attendus - recu)}</div>}
              </div>

              {Object.keys(dus).length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-bold uppercase tracking-wide text-ink-600">Casiers vides rendus</label>
                  {Object.entries(dus).map(([e, n]) => {
                    const rendu = parseInt(s?.casiers[e] ?? "0") || 0;
                    return (
                      <div key={e} className="flex items-center justify-between gap-3">
                        <span className="text-sm text-gray-700">{nomEmballage(e)} <span className="text-gray-400">({n} livré{n > 1 ? "s" : ""})</span>
                          {rendu < n && <span className="block text-xs font-semibold text-orange-700">{casiers(n - rendu)} encore dû{n - rendu > 1 ? "s" : ""}</span>}
                        </span>
                        <input type="number" inputMode="numeric" min="0" value={s?.casiers[e] ?? ""} onFocus={ev => ev.target.select()}
                          onChange={ev => majSaisie(l.id, { casiers: { ...s?.casiers, [e]: ev.target.value } })}
                          aria-label={`${nomEmballage(e)} rendus par ${l.client_nom}`}
                          className="w-24 h-11 rounded-xl border border-slate-300 px-3 text-lg font-bold text-center focus:outline-none focus:border-secondary" />
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="grid grid-cols-[auto_1fr] gap-2">
                <Button variant="secondary" size="sm" icon={<FileText size={14} />} onClick={() => voirFacture(l)}>Facture</Button>
                <Button size="sm" icon={<Check size={15} />} loading={enCours === l.id} disabled={enCours !== null} onClick={() => cloturerUne(l)}>
                  Clôturer
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Toute la tournée d'un coup, avec ce que le livreur doit remettre */}
      {affichees.length > 1 && (
        <div className="fixed left-0 right-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] lg:bottom-4 lg:left-64 px-4 z-20">
          <div className="max-w-4xl mx-auto">
            <button onClick={cloturerTout} disabled={enCours !== null}
              className="w-full min-h-14 py-2 px-4 rounded-2xl bg-ink-900 text-white shadow-lg flex items-center justify-between gap-3 disabled:opacity-60">
              <span className="flex items-center gap-2 font-semibold"><Check size={18} /> Clôturer {livreur === "tous" ? "tout" : `la tournée de ${livreur}`} ({affichees.length})</span>
              <span className="text-right text-xs leading-tight">
                <span className="chiffre block text-[15px] font-extrabold text-secondary-400">{formatPrix(totalArgent)}</span>
                {casiers(casiersAttendus)} vides
              </span>
            </button>
          </div>
        </div>
      )}

      <Modal isOpen={!!facture} onClose={() => setFacture(null)} title={facture?.numero_facture ?? "Facture"} size="md">
        {facture && (
          <div className="flex flex-col gap-4 p-4">
            <div className="border border-slate-200 rounded-xl overflow-y-auto max-h-[60vh]"><FactureHTML data={facture} /></div>
            <Button onClick={() => printFacture(facture).catch(() => {})}>Imprimer</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
