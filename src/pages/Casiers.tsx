import { useEffect, useState } from "react";
import { Boxes, ClipboardCheck, Trash2, History } from "lucide-react";
import { invoke } from "@/lib/db";
import { useToast } from "@/components/ui/Toast";
import { useAppStore } from "@/stores/appStore";
import Header from "@/components/layout/Header";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Card from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";
import EtatVide from "@/components/ui/EtatVide";
import { volumeFr, casiers } from "@/lib/format";

interface Plein { format_id: string; produit_nom: string; volume: number; unite: string; stock: number; }
interface TypeCasier {
  id: string; nom: string; vides: number; dernier_comptage: string | null;
  pleins: Plein[]; chez_clients: number; a_rendre_fournisseurs: number;
}
interface Inventaire { types: TypeCasier[]; sans_casier: Plein[]; }
interface MouvementVides {
  id: string; emballage_id: string; variation: number; stock_apres: number;
  source: string; commentaire: string | null; date: string; utilisateur_nom: string;
}

const SOURCES: Record<string, string> = {
  "vente": "Rapportés à une vente", "annulation": "Vente annulée", "retour client": "Rapportés par un client",
  "réception fournisseur": "Rendus au livreur", "règlement fournisseur": "Rendus au fournisseur",
  "inventaire": "Écart de comptage", "cassé": "Cassés ou perdus",
};

const dateCourte = (d: string) => new Date(d.replace(" ", "T")).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const lu = (v: string | undefined) => v === undefined || v.trim() === "" ? null : Math.max(0, parseInt(v) || 0);

/** Écart entre le nombre compté et celui de l'app. */
function Ecart({ app, compte }: { app: number; compte: number | null }) {
  if (compte === null) return <span className="w-14" />;
  const d = compte - app;
  return (
    <span className={["w-14 text-right text-xs font-bold", d === 0 ? "text-emerald-600" : d > 0 ? "text-sky-700" : "text-danger"].join(" ")}>
      {d === 0 ? "OK" : d > 0 ? `+${d}` : d}
    </span>
  );
}

/** Une ligne à compter : nombre dans l'app, saisie, écart. */
function LigneComptage({ libelle, detail, app, valeur, onChange }: {
  libelle: React.ReactNode; detail?: string; app: number; valeur: string | undefined; onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-gray-800 truncate">{libelle}</div>
        <div className="text-xs text-gray-400">App : {app}{detail ? ` · ${detail}` : ""}</div>
      </div>
      <input type="number" min="0" inputMode="numeric" placeholder={String(app)} value={valeur ?? ""}
        onChange={e => onChange(e.target.value)} aria-label={`Compté : ${typeof libelle === "string" ? libelle : ""}`}
        className="w-20 h-9 rounded-lg border border-slate-300 px-2 text-sm font-semibold text-right focus:outline-none focus:border-secondary" />
      <Ecart app={app} compte={lu(valeur)} />
    </div>
  );
}

export default function Casiers() {
  const { toast } = useToast();
  const loadAlertes = useAppStore((s) => s.loadAlertes);
  const [data, setData] = useState<Inventaire | null>(null);
  const [historique, setHistorique] = useState<MouvementVides[]>([]);
  const [vides, setVides] = useState<Record<string, string>>({});
  const [pleins, setPleins] = useState<Record<string, string>>({});
  const [commentaire, setCommentaire] = useState("");
  const [saving, setSaving] = useState(false);
  const [casse, setCasse] = useState({ emballageId: "", quantite: "", commentaire: "" });
  const [savingCasse, setSavingCasse] = useState(false);

  const load = async () => {
    try {
      const [inv, h] = await Promise.all([
        invoke<Inventaire>("get_inventaire_casiers"),
        invoke<MouvementVides[]>("get_mouvements_vides", {}).catch(() => [] as MouvementVides[]),
      ]);
      setData(inv); setHistorique(h.slice(0, 15));
      setCasse(c => ({ ...c, emballageId: c.emballageId || inv.types[0]?.id || "" }));
    } catch (e) { toast(String(e), "error"); }
  };
  useEffect(() => { load(); }, []);

  const types = data?.types ?? [];
  const nomType = (id: string) => types.find(t => t.id === id)?.nom ?? id;
  const sommePleins = (ps: Plein[]) => ps.reduce((t, p) => t + p.stock, 0);
  const totalVides = types.reduce((t, x) => t + x.vides, 0);
  const totalPleins = types.reduce((t, x) => t + sommePleins(x.pleins), 0);
  const totalClients = types.reduce((t, x) => t + x.chez_clients, 0);
  const totalFournisseurs = types.reduce((t, x) => t + x.a_rendre_fournisseurs, 0);

  const tousPleins = [...types.flatMap(t => t.pleins), ...(data?.sans_casier ?? [])];
  const ecartsVides = types.filter(t => { const n = lu(vides[t.id]); return n !== null && n !== t.vides; }).length;
  const ecartsPleins = tousPleins.filter(p => { const n = lu(pleins[p.format_id]); return n !== null && n !== p.stock; }).length;
  const saisis = Object.values(vides).filter(v => v.trim() !== "").length + Object.values(pleins).filter(v => v.trim() !== "").length;

  const valider = async () => {
    const ecarts = ecartsVides + ecartsPleins;
    if (ecarts > 0 && !confirm(`${ecarts} écart${ecarts > 1 ? "s" : ""} : les nombres comptés vont remplacer ceux de l'app. Continuer ?`)) return;
    setSaving(true);
    try {
      const res = await invoke<{ ecarts: number }>("valider_comptage_casiers", { vides, pleins, commentaire });
      toast(res.ecarts ? `Comptage enregistré : ${res.ecarts} écart${res.ecarts > 1 ? "s" : ""} corrigé${res.ecarts > 1 ? "s" : ""}` : "Comptage enregistré : tout correspond", "success");
      setVides({}); setPleins({}); setCommentaire("");
      await load(); loadAlertes();
    } catch (e) { toast(String(e), "error"); }
    setSaving(false);
  };

  const retirerCasses = async () => {
    setSavingCasse(true);
    try {
      await invoke("retirer_casiers_casses", { emballageId: casse.emballageId, quantite: parseInt(casse.quantite) || 0, commentaire: casse.commentaire });
      toast(`${casiers(parseInt(casse.quantite) || 0)} retirés (cassés ou perdus)`, "success");
      setCasse(c => ({ ...c, quantite: "", commentaire: "" }));
      await load();
    } catch (e) { toast(String(e), "error"); }
    setSavingCasse(false);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Casiers" subtitle="Vides et pleins au magasin : comptez, l'app compare" icone={<Boxes size={22} />}
        chiffres={!data ? undefined : [
          { label: "Vides au magasin", valeur: totalVides },
          { label: "Pleins au magasin", valeur: totalPleins },
          { label: "Chez les clients", valeur: totalClients, ton: totalClients > 0 ? "alerte" : "neutre" },
          { label: "À rendre aux fournisseurs", valeur: totalFournisseurs, ton: totalFournisseurs > 0 ? "alerte" : "neutre" },
        ]} />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-28 lg:pb-8 [&>*]:w-full [&>*]:max-w-4xl [&>*]:mx-auto [&>*]:flex-shrink-0 flex flex-col gap-4">
        {!data ? <Skeleton variant="card" count={3} /> : types.length === 0 ? (
          <EtatVide icone={<Boxes size={26} />} titre="Aucun type de casier" texte="Le gérant crée les types de casiers dans Paramètres." />
        ) : (
          <>
            <p className="text-sm text-gray-500 px-1">
              Comptez au magasin et saisissez les nombres. Une case laissée vide n'est pas modifiée.
            </p>

            {types.map(t => {
              const pleinsApp = sommePleins(t.pleins);
              const videsCompte = lu(vides[t.id]);
              const pleinsCompte = t.pleins.reduce((s, p) => s + (lu(pleins[p.format_id]) ?? p.stock), 0);
              const magasin = (videsCompte ?? t.vides) + pleinsCompte;
              return (
                <Card key={t.id} padding="none" className="overflow-hidden">
                  <div className="px-4 pt-3.5 pb-2 flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-[15px] font-bold text-ink-900">{t.nom}</h2>
                      <div className="text-xs text-gray-400">
                        {t.dernier_comptage ? `Dernier comptage : ${dateCourte(t.dernier_comptage)}` : "Jamais compté : faites un premier comptage des vides"}
                      </div>
                    </div>
                  </div>
                  <div className="divide-y divide-slate-100 border-t border-slate-100">
                    <LigneComptage libelle="Casiers vides" app={t.vides} valeur={vides[t.id]} onChange={v => setVides(x => ({ ...x, [t.id]: v }))} />
                    {t.pleins.length > 0 && (
                      <div className="px-3 pt-2.5 pb-1 text-[11px] font-bold uppercase tracking-wide text-gray-400 bg-slate-50">Pleins (par boisson)</div>
                    )}
                    {t.pleins.map(p => (
                      <LigneComptage key={p.format_id} libelle={`${p.produit_nom} ${volumeFr(p.volume, p.unite)}`} app={p.stock}
                        valeur={pleins[p.format_id]} onChange={v => setPleins(x => ({ ...x, [p.format_id]: v }))} />
                    ))}
                  </div>
                  <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex flex-col gap-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Au magasin (vides + pleins)</span>
                      <span className="font-bold text-ink-900">{magasin}{magasin !== t.vides + pleinsApp ? <span className="text-gray-400 font-normal"> (app : {t.vides + pleinsApp})</span> : null}</span>
                    </div>
                    <div className="flex justify-between"><span className="text-gray-500">Chez les clients</span><span className="font-semibold">{t.chez_clients}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">À rendre aux fournisseurs</span><span className="font-semibold">− {t.a_rendre_fournisseurs}</span></div>
                    <div className="flex justify-between pt-1 border-t border-slate-200 mt-0.5">
                      <span className="font-semibold text-gray-700">Casiers à vous</span>
                      <span className="font-extrabold text-ink-900">{magasin + t.chez_clients - t.a_rendre_fournisseurs}</span>
                    </div>
                  </div>
                </Card>
              );
            })}

            {data.sans_casier.length > 0 && (
              <Card padding="none" className="overflow-hidden">
                <div className="px-4 pt-3.5 pb-2">
                  <h2 className="text-[15px] font-bold text-ink-900">Packs et produits sans casier</h2>
                  <div className="text-xs text-gray-400">Stock seulement</div>
                </div>
                <div className="divide-y divide-slate-100 border-t border-slate-100">
                  {data.sans_casier.map(p => (
                    <LigneComptage key={p.format_id} libelle={`${p.produit_nom} ${volumeFr(p.volume, p.unite)}`} app={p.stock}
                      valeur={pleins[p.format_id]} onChange={v => setPleins(x => ({ ...x, [p.format_id]: v }))} />
                  ))}
                </div>
              </Card>
            )}

            <Input label="Commentaire du comptage (facultatif)" value={commentaire} onChange={e => setCommentaire(e.target.value)}
              placeholder="ex. : comptage du samedi soir" />

            {/* Reste visible pendant qu'on fait défiler la liste */}
            <div className="sticky bottom-24 lg:bottom-4 z-10">
              <div className="rounded-2xl bg-ink-900 text-white py-2 pl-4 pr-2 flex items-center gap-3 shadow-lg">
                <div className="flex-1 text-xs text-ink-300">
                  {saisis === 0 ? "Rien de saisi" : `${saisis} compté${saisis > 1 ? "s" : ""} · ${ecartsVides + ecartsPleins} écart${ecartsVides + ecartsPleins > 1 ? "s" : ""}`}
                </div>
                <Button icon={<ClipboardCheck size={16} />} onClick={valider} loading={saving} disabled={saisis === 0}>Valider</Button>
              </div>
            </div>

            {/* Casse */}
            <section className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-col gap-3">
              <h3 className="text-[13px] font-bold uppercase tracking-wide text-ink-600 flex items-center gap-2"><Trash2 size={14} /> Casiers vides cassés ou perdus</h3>
              <div className="flex gap-2">
                <select value={casse.emballageId} onChange={e => setCasse(c => ({ ...c, emballageId: e.target.value }))}
                  className="flex-1 min-w-0 rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-secondary">
                  {types.map(t => <option key={t.id} value={t.id}>{t.nom}</option>)}
                </select>
                <input type="number" min="1" inputMode="numeric" placeholder="Nombre" value={casse.quantite} onChange={e => setCasse(c => ({ ...c, quantite: e.target.value }))}
                  className="w-24 rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold text-right focus:outline-none focus:border-secondary" />
              </div>
              <Input placeholder="ex. : 2 casiers fendus au déchargement" value={casse.commentaire} onChange={e => setCasse(c => ({ ...c, commentaire: e.target.value }))} />
              <Button variant="secondary" onClick={retirerCasses} loading={savingCasse} disabled={!(parseInt(casse.quantite) > 0)}>Retirer du magasin</Button>
            </section>

            {/* Historique */}
            {historique.length > 0 && (
              <section>
                <h2 className="text-[15px] font-bold text-ink-900 mb-3 px-1 flex items-center gap-2"><History size={16} /> Derniers mouvements de vides</h2>
                <Card padding="none" className="overflow-hidden divide-y divide-slate-100">
                  {historique.map(m => (
                    <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-800 truncate">{SOURCES[m.source] ?? m.source}</div>
                        <div className="text-xs text-gray-400 truncate">
                          {nomType(m.emballage_id)} · {dateCourte(m.date)} · {m.utilisateur_nom}{m.commentaire ? ` · ${m.commentaire}` : ""}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className={["text-sm font-bold", m.variation > 0 ? "text-emerald-700" : "text-danger"].join(" ")}>{m.variation > 0 ? `+${m.variation}` : m.variation}</div>
                        <div className="text-[11px] text-gray-400">reste {m.stock_apres}</div>
                      </div>
                    </div>
                  ))}
                </Card>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
