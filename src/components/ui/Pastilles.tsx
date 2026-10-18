import { type ReactNode } from "react";

export interface Pastille<T extends string> { valeur: T; label: ReactNode; compte?: number }

/** Filtres en pastilles (une seule active), style encre. */
export default function Pastilles<T extends string>({ options, valeur, onChange }: {
  options: Pastille<T>[]; valeur: T; onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-0.5" role="tablist">
      {options.map(o => {
        const actif = o.valeur === valeur;
        return (
          <button key={o.valeur} role="tab" aria-selected={actif} onClick={() => onChange(o.valeur)}
            className={["flex-shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[13px] font-semibold transition-colors",
              actif ? "bg-ink-900 text-white" : "bg-white text-gray-600 border border-slate-200 hover:border-slate-300"].join(" ")}>
            {o.label}
            {o.compte !== undefined && (
              <span className={["min-w-[20px] h-5 px-1.5 rounded-full text-[11px] flex items-center justify-center",
                actif ? "bg-white/15 text-white" : "bg-slate-100 text-gray-600"].join(" ")}>{o.compte}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
