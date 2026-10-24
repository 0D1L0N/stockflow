import { useEffect, useState, type ReactNode } from "react";
import { lireNombre, arrondi } from "@/lib/format";
import { Wallet, Package2, ShoppingCart, XCircle, Minus, Plus, FilePlus2 } from "lucide-react";
import { usePeut } from "@/lib/droits";
import { useCatalogueStore } from "@/stores/catalogueStore";
import { invoke } from "@/lib/db";
import { useToast } from "@/components/ui/Toast";
import { useAppStore } from "@/stores/appStore";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";

export interface ClientCompte {
  id: string; nom: string; telephone: string | null;
  solde_argent?: number; emballages_dus?: Record<string, number>;
}

interface Operation {
  id: string; type: "vente" | "paiement" | "retour_emballages" | "annulation" | "dette";
  montant: number; emballages: Record<string, number>;
  numero_facture: string | null; commentaire: string | null;
  date: string; utilisateur_nom: string;
}

const LIBELLES: Record<Operation["type"], { texte: string; icone: ReactNode }> = {
  vente: { texte: "Vente", icone: <ShoppingCart size={13} /> },
  paiement: { texte: "Paiement", icone: <Wallet size={13} /> },
  retour_emballages: { texte: "Retour de casiers", icone: <Package2 size={13} /> },
  annulation: { texte: "Annulation de vente", icone: <XCircle size={13} /> },
  dette: { texte: "Dette ajoutée", icone: <FilePlus2 size={13} /> },
};

interface Props {
  client: ClientCompte | null;
  nomEmballage: (id: string) => string;
  onClose: () => void;
  /** Appelé après un paiement ou un retour, pour rafraîchir la liste */
  onChange: () => void;
}

/** Compte d'un client : ce qu'il doit, encaissement, retour de casiers, journal. */
export default function ModalCompteClient({ client, nomEmballage, onClose, onChange }: Props) {
  const { toast } = useToast();
  const formatPrix = useAppStore((s) => s.formatMontant);
  const [soldes, setSoldes] = useState({ argent: 0, casiers: {} as Record<string, number> });
  const [journal, setJournal] = useState<Operation[]>([]);
  const [loading, setLoading] = useState(true);
  const [montant, setMontant] = useState("");
  const [retours, setRetours] = useState<Record<string, string>>({});
  const [envoi, setEnvoi] = useState(false);
  // Dette sans vente (gérant, admin) : ancien cahier, prêt de casiers…
  const peutDette = usePeut("clients");
  const typesCasiers = useCatalogueStore(s => s.emballages);
  const [detteOuverte, setDetteOuverte] = useState(false);
  const [detteMontant, setDetteMontant] = useState("");
  const [detteCasiers, setDetteCasiers] = useState<Record<string, string>>({});
  const [detteMotif, setDetteMotif] = useState("");

  const chargerJournal = async (id: string) => {
    setLoading(true);
    try { setJournal(await invoke<Operation[]>("get_operations_client", { clientId: id })); }
    catch (e) { toast(String(e), "error"); }
    setLoading(false);
  };

  useEffect(() => {
    if (!client) return;
    setSoldes({ argent: client.solde_argent ?? 0, casiers: client.emballages_dus ?? {} });
    setMontant(""); setRetours({});
    setDetteOuverte(false); setDetteMontant(""); setDetteCasiers({}); setDetteMotif("");
    chargerJournal(client.id);
  }, [client?.id]);

  const casiersDus = Object.entries(soldes.casiers).filter(([, n]) => n > 0);

  const appliquer = (s: { solde_argent: number; emballages_dus: Record<string, number> }) => {
    setSoldes({ argent: s.solde_argent, casiers: s.emballages_dus });
    onChange();
    chargerJournal(client!.id);
  };

  const encaisser = async () => {
    const m = parseFloat(montant);
    if (!(m > 0)) { toast("Montant invalide", "warning"); return; }
    setEnvoi(true);
    try {
      appliquer(await invoke("encaisser_paiement", { clientId: client!.id, montant: m, commentaire: null }));
      toast(`Paiement de ${formatPrix(m)} enregistré`, "success");
      setMontant("");
    } catch (e) { toast(String(e), "error"); }
    setEnvoi(false);
  };

  const enregistrerRetour = async () => {
    const emballages = Object.fromEntries(Object.entries(retours).map(([e, v]) => [e, lireNombre(v) || 0]));
    setEnvoi(true);
    try {
      appliquer(await invoke("retour_emballages", { clientId: client!.id, emballages, commentaire: null }));
      toast("Retour de casiers enregistré", "success");
      setRetours({});
    } catch (e) { toast(String(e), "error"); }
    setEnvoi(false);
  };

  const enregistrerDette = async () => {
    const emballages = Object.fromEntries(Object.entries(detteCasiers).map(([e, v]) => [e, lireNombre(v) || 0]));
    setEnvoi(true);
    try {
      appliquer(await invoke("ajouter_dette", { clientId: client!.id, montant: parseFloat(detteMontant) || 0, emballages, commentaire: detteMotif }));
      toast("Dette enregistrée sur le compte", "success");
      setDetteOuverte(false); setDetteMontant(""); setDetteCasiers({}); setDetteMotif("");
    } catch (e) { toast(e instanceof Error ? e.message : String(e), "error"); }
    setEnvoi(false);
  };
  const detteVide = !(parseFloat(detteMontant) > 0) && !Object.values(detteCasiers).some(v => lireNombre(v) > 0);

  const resumeCasiers = (c: Record<string, number>) =>
    Object.entries(c).filter(([, n]) => n !== 0)
      .map(([e, n]) => `${n > 0 ? "+" : ""}${n} ${nomEmballage(e)}`).join(", ");

  return (
    <Modal isOpen={!!client} onClose={onClose} title={`Compte — ${client?.nom ?? ""}`} size="lg">
      <div className="p-6 flex flex-col gap-5">
        {/* Ce que le client doit */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className={["rounded-xl p-4", soldes.argent > 0 ? "bg-orange-50" : "bg-green-50"].join(" ")}>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Argent dû</div>
            <div className={["text-xl font-extrabold mt-1", soldes.argent > 0 ? "text-orange-700" : "text-secondary"].join(" ")}>
              {formatPrix(Math.max(0, soldes.argent))}
            </div>
          </div>
          <div className={["rounded-xl p-4", casiersDus.length ? "bg-orange-50" : "bg-green-50"].join(" ")}>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Casiers à rendre</div>
            {casiersDus.length === 0 ? (
              <div className="text-xl font-extrabold mt-1 text-secondary">0</div>
            ) : casiersDus.map(([e, n]) => (
              <div key={e} className="text-sm font-bold text-orange-700 mt-1">{n.toLocaleString("fr-FR")} × {nomEmballage(e)}</div>
            ))}
          </div>
        </div>

        {/* Encaisser */}
        {soldes.argent > 0 && (
          <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 p-4">
            <Input label="Encaisser un paiement" type="number" min="0" value={montant} inputMode="numeric"
              onChange={e => setMontant(e.target.value)} placeholder={`Jusqu'à ${formatPrix(soldes.argent)}`} />
            <div className="grid grid-cols-[auto_1fr] gap-2">
              <Button variant="secondary" onClick={() => setMontant(String(soldes.argent))}>Tout</Button>
              <Button icon={<Wallet size={15} />} onClick={encaisser} loading={envoi} disabled={!montant}>Encaisser</Button>
            </div>
          </div>
        )}

        {/* Retour de casiers */}
        {casiersDus.length > 0 && (
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Casiers rapportés</span>
            {casiersDus.map(([e, n]) => {
              const q = Math.max(0, Math.min(n, lireNombre(retours[e] ?? "0") || 0));
              return (
                <div key={e} className="flex items-center gap-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="text-gray-800 font-medium">{nomEmballage(e)}</div>
                    <div className="text-[11px] text-gray-400">{n.toLocaleString("fr-FR")} à rendre</div>
                  </div>
                  <button type="button" aria-label="Un de moins" onClick={() => setRetours(r => ({ ...r, [e]: String(arrondi(Math.max(0, q - 1))) }))}
                    className="w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center"><Minus size={14} /></button>
                  <input type="text" inputMode="decimal" placeholder="0" value={retours[e] ?? ""} aria-label={`Casiers rapportés : ${nomEmballage(e)}`}
                    onChange={ev => setRetours(r => ({ ...r, [e]: ev.target.value }))}
                    className="w-12 h-9 rounded-lg border border-slate-300 text-sm font-semibold text-center focus:outline-none focus:border-secondary" />
                  <button type="button" aria-label="Un de plus" onClick={() => setRetours(r => ({ ...r, [e]: String(arrondi(Math.min(n, q + 1))) }))}
                    className="w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center"><Plus size={14} /></button>
                </div>
              );
            })}
            <Button icon={<Package2 size={15} />} onClick={enregistrerRetour} loading={envoi} className="w-full"
              disabled={!Object.values(retours).some(v => lireNombre(v) > 0)}>
              Enregistrer le retour
            </Button>
          </div>
        )}

        {/* Dette sans vente : reprise d'un ancien cahier, prêt de casiers… */}
        {peutDette && (detteOuverte ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-orange-200 bg-orange-50/40 p-4">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Ajouter une dette</span>
            <Input label="Argent dû (facultatif)" type="number" min="0" inputMode="numeric" value={detteMontant}
              onChange={e => setDetteMontant(e.target.value)} placeholder="0" />
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-medium text-gray-700">Casiers dus</span>
              {typesCasiers.map(e => (
                <div key={e.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-gray-800">{e.nom}</span>
                  <input type="text" inputMode="decimal" placeholder="0" value={detteCasiers[e.id] ?? ""} aria-label={`Casiers dus : ${e.nom}`}
                    onChange={ev => setDetteCasiers(c => ({ ...c, [e.id]: ev.target.value }))}
                    className="w-20 h-10 rounded-lg border border-slate-300 text-sm font-semibold text-center focus:outline-none focus:border-secondary" />
                </div>
              ))}
            </div>
            <Input label="Motif (obligatoire)" value={detteMotif} onChange={e => setDetteMotif(e.target.value)}
              placeholder="ex. : reprise de l'ancien cahier, prêt de casiers" />
            <div className="grid grid-cols-[auto_1fr] gap-2">
              <Button variant="secondary" onClick={() => setDetteOuverte(false)}>Annuler</Button>
              <Button icon={<FilePlus2 size={15} />} onClick={enregistrerDette} loading={envoi}
                disabled={detteVide || detteMotif.trim().length < 3}>Enregistrer la dette</Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" icon={<FilePlus2 size={15} />} onClick={() => setDetteOuverte(true)} className="w-full">
            Ajouter une dette (sans vente)
          </Button>
        ))}

        {/* Journal : trace de tout ce qui a fait bouger le compte */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Historique du compte</span>
          {loading ? <Skeleton variant="card" count={2} /> : journal.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Aucune opération</p>
          ) : (
            <div className="flex flex-col divide-y divide-slate-100 border border-slate-200 rounded-2xl">
              {journal.map(o => (
                <div key={o.id} className="px-3 py-2 text-xs flex gap-3">
                  <span className="text-primary mt-0.5">{LIBELLES[o.type].icone}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-800">
                      {LIBELLES[o.type].texte}
                    </div>
                    {o.numero_facture && <div className="font-mono text-[11px] text-gray-500">{o.numero_facture}</div>}
                    <div className="text-gray-400">
                      {new Date(o.date).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      {o.utilisateur_nom ? ` · par ${o.utilisateur_nom}` : ""}
                    </div>
                    {resumeCasiers(o.emballages ?? {}) && <div className="text-gray-600">{resumeCasiers(o.emballages)}</div>}
                    {o.commentaire && <div className="text-gray-500 italic">{o.commentaire}</div>}
                  </div>
                  {o.montant !== 0 && (
                    <span className={["font-bold whitespace-nowrap", o.montant > 0 ? "text-orange-700" : "text-secondary"].join(" ")}>
                      {o.montant > 0 ? "+" : "−"}{formatPrix(Math.abs(o.montant))}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-gray-400">+ : le client doit davantage · − : il a réglé ou rendu.</p>
        </div>
      </div>
    </Modal>
  );
}
