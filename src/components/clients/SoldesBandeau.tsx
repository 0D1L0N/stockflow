import { Wallet, Package2 } from "lucide-react";
import { useAppStore } from "@/stores/appStore";

interface Props {
  client: { solde_argent?: number; emballages_dus?: Record<string, number> };
  nomEmballage: (id: string) => string;
  className?: string;
}

/** Rappel de ce que le client doit déjà : argent et casiers. Rien si tout est réglé. */
export default function SoldesBandeau({ client, nomEmballage, className = "mt-2" }: Props) {
  const formatPrix = useAppStore((s) => s.formatMontant);
  const argent = client.solde_argent ?? 0;
  const casiers = Object.entries(client.emballages_dus ?? {}).filter(([, n]) => n > 0);
  if (argent <= 0 && casiers.length === 0) return null;

  return (
    <div className={["flex flex-wrap gap-x-3 gap-y-1 bg-orange-50 text-orange-800 rounded-lg px-3 py-2 text-xs", className].join(" ")}>
      <span className="font-semibold">Doit déjà :</span>
      {argent > 0 && (
        <span className="flex items-center gap-1"><Wallet size={12} />{formatPrix(argent)}</span>
      )}
      {casiers.map(([e, n]) => (
        <span key={e} className="flex items-center gap-1"><Package2 size={12} />{n.toLocaleString("fr-FR")} × {nomEmballage(e)}</span>
      ))}
    </div>
  );
}
