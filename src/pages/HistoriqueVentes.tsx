import { useEffect, useState } from "react";
import { XCircle, Filter, Printer, Download, Loader, History, Receipt, Wallet } from "lucide-react";
import Pastilles from "@/components/ui/Pastilles";
import EtatVide from "@/components/ui/EtatVide";
import Avatar from "@/components/ui/Avatar";
import { invoke } from "@/lib/db";
import { useToast } from "@/components/ui/Toast";
import { useAppStore } from "@/stores/appStore";
import Header from "@/components/layout/Header";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import Skeleton from "@/components/ui/Skeleton";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { FactureHTML } from "@/components/facture/FactureHTML";
import { type FactureData } from "@/components/facture/FacturePDF";
import { prepareVenteData, downloadFacture, printFacture, type ParametresRaw } from "@/lib/pdf";
import { volumeFr } from "@/lib/format";
import { useTempsReel } from "@/lib/tempsReel";
import { usePeut } from "@/lib/droits";
import { useNavigate } from "react-router-dom";

interface Vente {
  id: string; numero_facture: string; date: string | null;
  client_id: string; client_nom: string | null;
  total: number; montant_recu: number | null; monnaie_rendue: number | null; statut: string;
  reste_du?: number;
  emballages_livres?: Record<string, number>; emballages_rendus?: Record<string, number>;
  /** Réglé après la vente (argent, casiers) */
  regle_apres?: number; rendus_apres?: Record<string, number>;
  livraison?: { statut: string; livreurs: string[] } | null;
}
const enLivraison = (v: Vente) => v.statut === "validée" && v.livraison?.statut === "en_cours";

/** Ce qu'il reste à payer sur la facture, après les règlements faits depuis. */
const resteArgent = (v: Vente) => v.statut === "validée" ? Math.max(0, (v.reste_du ?? 0) - (v.regle_apres ?? 0)) : 0;
/** Casiers encore dus sur la facture, par type d'emballage. */
function casiersDus(v: Vente): Record<string, number> {
  if (v.statut !== "validée") return {};
  const dus: Record<string, number> = {};
  for (const [e, n] of Object.entries(v.emballages_livres ?? {})) {
    const d = n - (v.emballages_rendus?.[e] ?? 0) - (v.rendus_apres?.[e] ?? 0);
    if (d > 0) dus[e] = d;
  }
  return dus;
}
const totalCasiers = (c: Record<string, number>) => Object.values(c).reduce((t, n) => t + n, 0);
interface DetailVente { casier?: number | null;
  id: string; vente_id: string; format_id: string;
  produit_nom: string | null; volume: number | null; unite: string | null;
  quantite: number; prix_utilise: number;
}

/** « 18/10 07:45 » pour les listes (la date complète reste dans le détail). */
function dateCourte(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function HistoriqueVentes() {
  const { toast } = useToast();
  const { symbole, position, formatMontant } = useAppStore();
  const formatPrix = formatMontant;
  const [ventes, setVentes] = useState<Vente[]>([]);
  const [statut, setStatut] = useState<"toutes" | "payees" | "credit" | "annulees">("toutes");
  const [comptoirId, setComptoirId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [parametres, setParametres] = useState<ParametresRaw | null>(null);
  const [nomsEmballages, setNomsEmballages] = useState<Record<string, string>>({});

  // Modal détail / annulation
  const [detail, setDetail] = useState<{ vente: Vente; details: DetailVente[] } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [annulerLoading, setAnnulerLoading] = useState(false);
  const peutAnnuler = usePeut("annuler");

  // Règlement après coup (gérant, admin) : l'argent et les casiers remis plus tard sur cette facture
  const peutRegler = usePeut("clients");
  const navigate = useNavigate();
  const [regler, setRegler] = useState<Vente | null>(null);
  const [reglerMontant, setReglerMontant] = useState("");
  const [reglerCasiers, setReglerCasiers] = useState<Record<string, string>>({});
  const [reglerLoading, setReglerLoading] = useState(false);

  // Modal réimpression
  const [factureData, setFactureData] = useState<FactureData | null>(null);
  const [modalFacture, setModalFacture] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const load = async (dd = dateDebut, df = dateFin, silencieux = false) => {
    try {
      if (!silencieux) setLoading(true);
      const data = await invoke<Vente[]>("get_ventes", {
        dateDebut: dd || null, dateFin: df || null, clientId: null,
      });
      setVentes(data);
    } catch (e) {
      console.error("get_ventes:", e);
      setVentes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    invoke<ParametresRaw>("get_parametres").then(setParametres);
    invoke<{ id: string; est_defaut?: number }[]>("get_clients")
      .then(l => setComptoirId(l.find(c => c.est_defaut === 1)?.id ?? null)).catch(() => {});
    invoke<{ id: string; nom: string }[]>("get_emballages")
      .then(l => setNomsEmballages(Object.fromEntries(l.map(e => [e.id, e.nom])))).catch(() => {});
  }, []);

  // Vente ou annulation faite sur un autre appareil
  useTempsReel(["ventes_du_jour"], () => { load(dateDebut, dateFin, true); });

  const openDetail = async (v: Vente) => {
    const data = await invoke<{ vente: Vente; details: DetailVente[] }>("get_vente_details", { venteId: v.id });
    setDetail(data);
    setModalOpen(true);
  };

  const openReimprimer = async (v: Vente) => {
    const data = await invoke<{ vente: Vente; details: DetailVente[] }>("get_vente_details", { venteId: v.id });
    if (!parametres) return;
    const fd = prepareVenteData(
      data.vente,
      data.details,
      { id: data.vente.client_id, nom: data.vente.client_nom ?? "Client", telephone: null },
      parametres,
      { symbole, position },
      id => nomsEmballages[id] ?? "Casier",
    );
    setFactureData(fd);
    setModalFacture(true);
  };

  const annuler = async () => {
    if (!detail) return;
    if (!confirm(`Annuler la vente ${detail.vente.numero_facture} ?`)) return;
    setAnnulerLoading(true);
    try {
      await invoke("annuler_vente", { venteId: detail.vente.id });
      toast("Vente annulée — stock remis à jour", "success");
      setModalOpen(false);
      await load();
    } catch (e) { toast(String(e), "error"); }
    setAnnulerLoading(false);
  };

  const ouvrirRegler = (v: Vente) => {
    setReglerMontant(String(resteArgent(v) || ""));
    setReglerCasiers(Object.fromEntries(Object.entries(casiersDus(v)).map(([e, n]) => [e, String(n)])));
    setModalOpen(false);
    setRegler(v);
  };

  const validerReglement = async () => {
    if (!regler) return;
    setReglerLoading(true);
    try {
      const emballages = Object.fromEntries(Object.entries(reglerCasiers).map(([e, n]) => [e, parseInt(n) || 0]));
      await invoke("regler_vente", { venteId: regler.id, montant: parseFloat(reglerMontant) || 0, emballages });
      toast(`Règlement enregistré sur ${regler.numero_facture}`, "success");
      setRegler(null);
      await load(dateDebut, dateFin, true);
    } catch (e) { toast(e instanceof Error ? e.message : String(e), "error"); }
    setReglerLoading(false);
  };

  const handleImprimer = async () => {
    if (!factureData) return;
    setPdfLoading(true);
    try { await printFacture(factureData); } catch { /* ignore */ }
    setPdfLoading(false);
  };

  const handleTelecharger = async () => {
    if (!factureData) return;
    setPdfLoading(true);
    try { await downloadFacture(factureData); } catch { /* ignore */ }
    setPdfLoading(false);
  };

  const nbValidees = ventes.filter(v => v.statut === "validée").length;
  // « À encaisser » : il reste de l'argent ou des casiers dus sur la facture (hors comptoir)
  const estCredit = (v: Vente) => v.client_id !== comptoirId && (resteArgent(v) > 0 || totalCasiers(casiersDus(v)) > 0);
  const nbCredit = ventes.filter(estCredit).length;
  const nbAnnulees = ventes.filter(v => v.statut !== "validée").length;
  const ventesAffichees = ventes.filter(v =>
    statut === "toutes" ? true
    : statut === "annulees" ? v.statut !== "validée"
    : statut === "credit" ? estCredit(v)
    : v.statut === "validée" && !estCredit(v));
  const totalJour = ventes.filter(v => v.statut === "validée").reduce((s, v) => s + v.total, 0);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Historique des ventes" subtitle="Factures, réimpression et annulation" icone={<History size={22} />}
        chiffres={loading ? undefined : [
          { label: "Ventes", valeur: nbValidees },
          { label: "Montant total", valeur: formatPrix(totalJour), ton: "succes" },
          { label: "À encaisser", valeur: nbCredit, ton: nbCredit > 0 ? "alerte" : "neutre" },
          { label: "Annulées", valeur: nbAnnulees, ton: nbAnnulees > 0 ? "danger" : "neutre" },
        ]} />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-28 lg:pb-8 [&>*]:w-full [&>*]:max-w-4xl [&>*]:mx-auto [&>*]:flex-shrink-0 flex flex-col gap-3">
        {/* Filtres date */}
        <Card className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-32">
            <label className="text-[13px] font-medium text-gray-700 block mb-1.5">Du</label>
            <input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:border-secondary" />
          </div>
          <div className="flex-1 min-w-32">
            <label className="text-[13px] font-medium text-gray-700 block mb-1.5">Au</label>
            <input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:border-secondary" />
          </div>
          <Button icon={<Filter size={15} />} onClick={() => load()} size="sm">Filtrer</Button>
          <Button variant="secondary" size="sm" onClick={() => { setDateDebut(""); setDateFin(""); load("", ""); }}>
            Réinitialiser
          </Button>
        </Card>

        <Pastilles valeur={statut} onChange={setStatut} options={[
          { valeur: "toutes", label: "Toutes", compte: ventes.length },
          { valeur: "payees", label: "Payées", compte: nbValidees - nbCredit },
          { valeur: "credit", label: "À encaisser", compte: nbCredit },
          { valeur: "annulees", label: "Annulées", compte: nbAnnulees },
        ]} />

        {loading ? (
          <Skeleton variant="table-row" count={6} />
        ) : ventesAffichees.length === 0 ? (
          <EtatVide icone={<Receipt size={26} />} titre="Aucune vente"
            texte={ventes.length === 0 ? "Aucune vente sur cette période." : "Aucune vente ne correspond à ce filtre."} />
        ) : (
          <Card padding="none" className="overflow-hidden divide-y divide-slate-100">
            {ventesAffichees.map(v => {
              const annulee = v.statut !== "validée";
              const reste = v.client_id !== comptoirId ? resteArgent(v) : 0;
              const dus = v.client_id !== comptoirId ? totalCasiers(casiersDus(v)) : 0;
              return (
                <div key={v.id} onClick={() => openDetail(v)}
                  className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-slate-50 active:bg-slate-100 transition-colors">
                  <Avatar nom={v.client_nom ?? "?"} taille="md" rond className={annulee ? "opacity-40" : ""} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className={["font-semibold text-sm truncate", annulee ? "text-gray-400 line-through" : "text-gray-900"].join(" ")}>
                        {v.client_nom ?? "—"}
                      </span>
                      <span className={["chiffre font-extrabold text-[15px] whitespace-nowrap", annulee ? "text-gray-400 line-through" : "text-gray-900"].join(" ")}>
                        {formatPrix(v.total)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 mt-0.5">
                      <span className="text-xs text-gray-500 truncate">
                        <span className="font-mono">{v.numero_facture}</span> · {dateCourte(v.date)}
                      </span>
                      {annulee ? <Badge variant="danger">Annulée</Badge>
                        : enLivraison(v) ? <Badge variant="info">En livraison · {v.livraison?.livreurs.join(", ")}</Badge>
                        : reste > 0 || dus > 0 ? (
                          <span className="flex gap-1 flex-shrink-0">
                            {reste > 0 && <Badge variant="warning">Reste {formatPrix(reste)}</Badge>}
                            {dus > 0 && <Badge variant="info">{dus} {dus > 1 ? "casiers dus" : "casier dû"}</Badge>}
                          </span>
                        ) : <Badge variant="success">Payée</Badge>}
                    </div>
                  </div>
                  {!annulee && (
                    <button onClick={e => { e.stopPropagation(); openReimprimer(v); }} title="Réimprimer" aria-label="Réimprimer la facture"
                      className="p-2 rounded-lg hover:bg-slate-100 text-gray-400 hover:text-primary transition-colors flex-shrink-0">
                      <Printer size={16} />
                    </button>
                  )}
                </div>
              );
            })}
          </Card>
        )}
      </div>

      {/* Modal détail */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={detail?.vente.numero_facture} size="md">
        {detail && (
          <div className="p-6 flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">Client : </span><span className="font-medium">{detail.vente.client_nom}</span></div>
              <div><span className="text-gray-500">Date : </span><span className="font-medium">{formatDate(detail.vente.date)}</span></div>
              {detail.vente.livraison && (
                <div className="col-span-2"><span className="text-gray-500">Livraison : </span>
                  <span className="font-medium">{detail.vente.livraison.livreurs.join(", ")} · {enLivraison(detail.vente) ? "en cours" : "livrée"}</span>
                </div>
              )}
              <div><span className="text-gray-500">Statut : </span>
                <Badge variant={detail.vente.statut === "validée" ? "success" : "danger"}>{detail.vente.statut}</Badge>
              </div>
              {detail.vente.monnaie_rendue != null && (
                <div><span className="text-gray-500">Monnaie rendue : </span>
                  <span className="font-medium text-secondary">{formatPrix(detail.vente.monnaie_rendue)}</span>
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 pt-3">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Articles</div>
              {detail.details.map(d => (
                <div key={d.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0 text-sm">
                  <div>
                    <span className="font-medium text-gray-800">{d.produit_nom}</span>
                    {d.volume && <span className="text-gray-400 text-xs ml-1">{volumeFr(d.volume, d.unite, d.casier)}</span>}
                  </div>
                  <div className="text-right">
                    <div className="text-gray-500 text-xs">{d.quantite} × {formatPrix(d.prix_utilise)}</div>
                    <div className="font-semibold text-gray-800">{formatPrix(d.quantite * d.prix_utilise)}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-200">
              <span className="font-bold text-gray-800">Total</span>
              <span className="font-extrabold text-xl text-primary">{formatPrix(detail.vente.total)}</span>
            </div>

            {detail.vente.client_id !== comptoirId && (resteArgent(detail.vente) > 0 || totalCasiers(casiersDus(detail.vente)) > 0 || (detail.vente.regle_apres ?? 0) > 0) && (
              <div className="flex flex-col gap-1 bg-orange-50 rounded-xl px-3 py-2.5 text-sm text-orange-900">
                {(detail.vente.regle_apres ?? 0) > 0 && (
                  <div className="flex justify-between"><span>Réglé après la vente</span><span className="font-semibold">{formatPrix(detail.vente.regle_apres ?? 0)}</span></div>
                )}
                {resteArgent(detail.vente) > 0 && (
                  <div className="flex justify-between font-bold"><span>Reste à payer</span><span>{formatPrix(resteArgent(detail.vente))}</span></div>
                )}
                {Object.entries(casiersDus(detail.vente)).map(([e, n]) => (
                  <div key={e} className="flex justify-between"><span>{nomsEmballages[e] ?? "Casiers"} dus</span><span className="font-semibold">{n}</span></div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {enLivraison(detail.vente) && (
                <Button size="sm" icon={<Wallet size={14} />} onClick={() => { setModalOpen(false); navigate("/livraisons"); }}>
                  Noter le retour du livreur
                </Button>
              )}
              {peutRegler && !enLivraison(detail.vente) && detail.vente.client_id !== comptoirId && (resteArgent(detail.vente) > 0 || totalCasiers(casiersDus(detail.vente)) > 0) && (
                <Button size="sm" icon={<Wallet size={14} />} onClick={() => ouvrirRegler(detail.vente)}>
                  Régler
                </Button>
              )}
              {detail.vente.statut === "validée" && (
                <Button variant="secondary" size="sm" icon={<Printer size={14} />}
                  onClick={() => { setModalOpen(false); openReimprimer(detail.vente); }}>
                  Réimprimer
                </Button>
              )}
              {detail.vente.statut === "validée" && peutAnnuler && (
                <Button variant="danger" icon={<XCircle size={15} />} onClick={annuler} loading={annulerLoading}>
                  Annuler cette vente
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Règlement après coup */}
      <Modal isOpen={!!regler} onClose={() => setRegler(null)} title={regler ? `Régler ${regler.numero_facture}` : ""} size="md">
        {regler && (
          <div className="p-4 sm:p-6 flex flex-col gap-4">
            <div className="text-sm text-gray-600">{regler.client_nom} · facture du {formatDate(regler.date)}</div>
            {resteArgent(regler) > 0 && (
              <section className="flex flex-col gap-2">
                <div className="flex justify-between items-baseline">
                  <label className="text-[13px] font-bold uppercase tracking-wide text-ink-600">Argent remis</label>
                  <span className="text-xs text-gray-500">reste {formatPrix(resteArgent(regler))}</span>
                </div>
                <div className="relative">
                  <input type="number" inputMode="numeric" min="0" max={resteArgent(regler)} value={reglerMontant}
                    onChange={e => setReglerMontant(e.target.value)} aria-label="Argent remis"
                    className="w-full h-14 rounded-xl border border-slate-300 px-4 pr-16 text-xl font-bold focus:outline-none focus:border-secondary" />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-semibold">{symbole}</span>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setReglerMontant(String(resteArgent(regler)))}
                    className="h-10 px-3 rounded-full text-[13px] font-semibold border bg-white text-gray-700 border-slate-300">Tout le reste</button>
                  <button type="button" onClick={() => setReglerMontant("0")}
                    className="h-10 px-3 rounded-full text-[13px] font-semibold border bg-white text-gray-700 border-slate-300">Rien</button>
                </div>
              </section>
            )}
            {Object.keys(casiersDus(regler)).length > 0 && (
              <section className="flex flex-col gap-2">
                <label className="text-[13px] font-bold uppercase tracking-wide text-ink-600">Casiers vides rendus</label>
                {Object.entries(casiersDus(regler)).map(([e, n]) => (
                  <div key={e} className="flex items-center justify-between gap-3">
                    <span className="text-sm text-gray-700">{nomsEmballages[e] ?? "Casiers"} <span className="text-gray-400">({n} {n > 1 ? "dus" : "dû"})</span></span>
                    <input type="number" inputMode="numeric" min="0" max={n} value={reglerCasiers[e] ?? ""}
                      onChange={ev => setReglerCasiers(c => ({ ...c, [e]: ev.target.value }))} aria-label={`Casiers ${nomsEmballages[e] ?? ""} rendus`}
                      className="w-24 h-11 rounded-xl border border-slate-300 px-3 text-lg font-bold text-center focus:outline-none focus:border-secondary" />
                  </div>
                ))}
              </section>
            )}
            <Button onClick={validerReglement} loading={reglerLoading} icon={<Wallet size={15} />}>
              Enregistrer le règlement
            </Button>
          </div>
        )}
      </Modal>

      {/* Modal réimpression */}
      <Modal isOpen={modalFacture} onClose={() => setModalFacture(false)}
        title={factureData?.numero_facture ?? "Facture"} size="md">
        {factureData && (
          <div className="flex flex-col gap-4 p-4">
            {/* Aperçu */}
            <div className="border border-slate-200 rounded-xl overflow-y-auto max-h-72">
              <FactureHTML data={factureData} />
            </div>
            {/* Actions */}
            <div className="grid grid-cols-2 gap-3">
              <Button
                icon={pdfLoading ? <Loader size={14} className="animate-spin" /> : <Printer size={14} />}
                onClick={handleImprimer}
                disabled={pdfLoading}
              >
                Imprimer
              </Button>
              <Button
                variant="secondary"
                icon={pdfLoading ? <Loader size={14} className="animate-spin" /> : <Download size={14} />}
                onClick={handleTelecharger}
                disabled={pdfLoading}
              >
                Télécharger PDF
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
