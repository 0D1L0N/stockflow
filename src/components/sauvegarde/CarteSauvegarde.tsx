import { useState } from "react";
import { DatabaseBackup, Download, Share2 } from "lucide-react";
import { invoke } from "@/lib/db";
import { useToast } from "@/components/ui/Toast";
import { telechargerBlob, partageDisponible } from "@/lib/pdf";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

/** Jours écoulés depuis une date "AAAA-MM-JJ HH:MM:SS" (null si jamais). */
export function joursDepuis(date: string | null | undefined): number | null {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date.replace(" ", "T")).getTime()) / 86_400_000);
}

/** Paramètres → sauvegarde complète des données dans un fichier. */
export default function CarteSauvegarde({ derniere, onFaite }: { derniere: string | null; onFaite: (date: string) => void }) {
  const { toast } = useToast();
  const [envoi, setEnvoi] = useState(false);
  const jours = joursDepuis(derniere);
  const enRetard = jours === null || jours >= 7;

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
      onFaite(new Date().toISOString());
    } catch (e) { toast(String(e), "error"); }
    setEnvoi(false);
  };

  // Le partage de fichiers JSON n'est pas accepté partout : on teste avec ce type précis
  const peutPartager = (() => {
    try {
      return partageDisponible() && navigator.canShare({ files: [new File(["{}"], "t.json", { type: "application/json" })] });
    } catch { return false; }
  })();

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <DatabaseBackup size={16} className="text-primary" />
        <h3 className="font-semibold text-gray-700 text-sm">Sauvegarde des données</h3>
      </div>
      <p className="text-xs text-gray-500 -mt-1">
        Un fichier avec tous vos produits, clients, ventes et dettes. Gardez-le hors de l'application
        (Google Drive, e-mail, WhatsApp…) : il permet de tout récupérer en cas de problème.
      </p>
      <div className={["text-sm rounded-xl px-3 py-2", enRetard ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"].join(" ")}>
        {jours === null ? "Aucune sauvegarde pour l'instant."
          : jours === 0 ? "Dernière sauvegarde : aujourd'hui."
          : `Dernière sauvegarde : il y a ${jours} jour${jours > 1 ? "s" : ""}.`}
        {enRetard && " Pensez à en faire une chaque semaine."}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {peutPartager && (
          <Button icon={<Share2 size={15} />} onClick={() => sauvegarder(true)} loading={envoi}>
            Envoyer vers Drive, WhatsApp…
          </Button>
        )}
        <Button variant={peutPartager ? "secondary" : "primary"} icon={<Download size={15} />}
          onClick={() => sauvegarder(false)} loading={envoi}>
          Télécharger le fichier
        </Button>
      </div>
    </Card>
  );
}
