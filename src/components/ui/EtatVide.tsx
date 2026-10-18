import { type ReactNode } from "react";

/** Liste vide : pictogramme, message, et éventuellement une action. */
export default function EtatVide({ icone, titre, texte, action }: {
  icone: ReactNode; titre: string; texte?: string; action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center py-12 px-6 rounded-2xl border border-dashed border-slate-300 bg-white/60">
      <span className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-4">{icone}</span>
      <p className="font-display font-bold text-ink-900">{titre}</p>
      {texte && <p className="text-sm text-gray-500 mt-1 max-w-xs">{texte}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
