import { useState } from "react";
import { DatabaseBackup, Download, Share2, CalendarClock, Hand, ExternalLink } from "lucide-react";
import { invoke } from "@/lib/db";
import { useToast } from "@/components/ui/Toast";
import { telechargerBlob, partageDisponible } from "@/lib/pdf";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

/** Page GitHub où se trouvent les sauvegardes automatiques (90 jours). */
export const URL_SAUVEGARDES_AUTO = "https://github.com/0D1L0N/stockflow/actions/workflows/sauvegarde.yml";

/** Jours écoulés depuis une date "AAAA-MM-JJ HH:MM:SS" ou ISO (null si jamais). */
export function joursDepuis(date: string | null | undefined): number | null {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date.replace(" ", "T")).getTime()) / 86_400_000);
}

/**
 * Jours depuis la sauvegarde la plus récente, qu'elle soit manuelle ou
 * automatique (null si aucune). Sert au rappel du tableau de bord.
 */
export function joursDepuisDerniereSauvegarde(p: { derniere_sauvegarde?: string | null; derniere_sauvegarde_auto?: string | null }) {
  const jours = [joursDepuis(p.derniere_sauvegarde), joursDepuis(p.derniere_sauvegarde_auto)].filter((j): j is number => j !== null);
  return jours.length ? Math.min(...jours) : null;
}

const libelleJours = (j: number | null) =>
  j === null ? "jamais" : j === 0 ? "aujourd'hui" : j === 1 ? "hier" : `il y a ${j} jours`;

interface Props {
  derniere: string | null;
  derniereAuto: string | null;
  auto: boolean;
  onChange: (champs: { derniere_sauvegarde?: string; sauvegarde_auto?: boolean }) => void;
}

/** Paramètres → sauvegarde : automatique chaque semaine ou manuelle, au choix du gérant. */
export default function CarteSauvegarde({ derniere, derniereAuto, auto, onChange }: Props) {
  const { toast } = useToast();
  const [envoi, setEnvoi] = useState(false);
  const [changement, setChangement] = useState(false);

  const choisir = async (actif: boolean) => {
    if (actif === auto) return;
    setChangement(true);
    try {
      await invoke("set_sauvegarde_auto", { actif });
      onChange({ sauvegarde_auto: actif });
      toast(actif ? "Sauvegarde automatique activée (chaque dimanche soir)" : "Sauvegarde automatique désactivée", "success");
    } catch (e) { toast(String(e), "error"); }
    setChangement(false);
  };

  const sauvegarder = async (partager: boolean) => {
    setEnvoi(true);
    try {
      const r = await invoke<{ contenu: string; nom_fichier: string; documents: number }>("exporter_donnees");
      const blob = new Blob([r.contenu], { type: "application/json" });
      if (partager) {
        const fichier = new File([blob], r.nom_fichier, { type: "application/json" });
        try { await navigator.share({ files: [fichier], title: "Sauvegarde StockFlow" }); }
        catch (e) { if ((e as Error)?.name !== "AbortError") throw e; }
      } else {
        telechargerBlob(blob, r.nom_fichier);
      }
      toast(`Sauvegarde prête : ${r.documents} enregistrements`, "success");
      onChange({ derniere_sauvegarde: new Date().toISOString() });
    } catch (e) { toast(String(e), "error"); }
    setEnvoi(false);
  };

  // Le partage de fichiers JSON n'est pas accepté partout : on teste avec ce type précis
  const peutPartager = (() => {
    try {
      return partageDisponible() && navigator.canShare({ files: [new File(["{}"], "t.json", { type: "application/json" })] });
    } catch { return false; }
  })();

  const option = (actif: boolean, icone: React.ReactNode, titre: string, texte: string) => (
    <button type="button" onClick={() => choisir(actif)} disabled={changement} aria-pressed={auto === actif}
      className={["flex-1 text-left rounded-xl border p-3 transition-colors disabled:opacity-60",
        auto === actif ? "border-secondary-600 bg-secondary-50 ring-1 ring-secondary-600" : "border-slate-200 hover:border-slate-300"].join(" ")}>
      <div className="flex items-center gap-2 font-semibold text-sm text-gray-900">{icone}{titre}</div>
      <div className="text-xs text-gray-500 mt-1">{texte}</div>
    </button>
  );

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <div className="flex items-center gap-2">
          <DatabaseBackup size={16} className="text-primary" />
          <h3 className="font-semibold text-gray-900 text-sm">Sauvegarde des données</h3>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Une copie de tous vos produits, clients, ventes et dettes, gardée hors de l'application.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        {option(true, <CalendarClock size={15} className="text-secondary-700" />, "Automatique",
          "Chaque dimanche soir, conservée 90 jours. Vous pouvez aussi sauvegarder à la main.")}
        {option(false, <Hand size={15} className="text-gray-600" />, "Manuelle seulement",
          "Vous lancez la sauvegarde vous-même avec les boutons ci-dessous.")}
      </div>

      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <dt className="text-gray-500">Dernière automatique</dt>
          <dd className="font-semibold text-gray-900 mt-0.5">{libelleJours(joursDepuis(derniereAuto))}</dd>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <dt className="text-gray-500">Dernière manuelle</dt>
          <dd className="font-semibold text-gray-900 mt-0.5">{libelleJours(joursDepuis(derniere))}</dd>
        </div>
      </dl>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {peutPartager && (
          <Button icon={<Share2 size={15} />} onClick={() => sauvegarder(true)} loading={envoi}>
            Envoyer vers Drive, WhatsApp…
          </Button>
        )}
        <Button variant={peutPartager ? "secondary" : "primary"} icon={<Download size={15} />}
          onClick={() => sauvegarder(false)} loading={envoi}>
          Sauvegarder maintenant
        </Button>
      </div>

      {auto && (
        <a href={URL_SAUVEGARDES_AUTO} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-secondary-700 hover:underline self-start">
          <ExternalLink size={13} /> Retrouver les sauvegardes automatiques (GitHub)
        </a>
      )}
    </Card>
  );
}
