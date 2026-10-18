import { type ReactNode } from "react";

export interface ChiffreEntete {
  label: string;
  valeur: ReactNode;
  /** Couleur du chiffre : neutre (encre), alerte (orange), danger (rouge), succes (vert) */
  ton?: "neutre" | "alerte" | "danger" | "succes";
}

interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /** Pictogramme de la page, affiché dans une pastille encre */
  icone?: ReactNode;
  /** Résumé chiffré de la page, sous le titre */
  chiffres?: ChiffreEntete[];
}

const TONS = {
  neutre: "text-ink-900",
  alerte: "text-orange-600",
  danger: "text-red-600",
  succes: "text-emerald-600",
};

/**
 * En-tête de page : pastille encre, grand titre, actions, puis un résumé
 * chiffré propre à la page. Même colonne centrée que le contenu (max-w-4xl).
 */
export default function Header({ title, subtitle, actions, icone, chiffres }: HeaderProps) {
  return (
    <div className="bg-white border-b border-slate-200 flex-shrink-0 px-4 sm:px-6 pb-4 sm:pb-6 pt-[calc(1rem+env(safe-area-inset-top))] sm:pt-[calc(1.75rem+env(safe-area-inset-top))]">
      <div className="w-full max-w-4xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            {icone && (
              <span className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-ink-900 text-secondary-400 flex items-center justify-center flex-shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                {icone}
              </span>
            )}
            <div className="min-w-0">
              <h1 className="font-extrabold text-ink-900 text-[22px] sm:text-[30px] leading-tight truncate">{title}</h1>
              {subtitle && <p className="text-[13px] text-gray-500 mt-0.5 truncate">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
        </div>

        {chiffres && chiffres.length > 0 && (
          <div className="flex gap-2 sm:gap-3 mt-4 sm:mt-5 overflow-x-auto sans-barre -mx-4 px-4 sm:mx-0 sm:px-0">
            {chiffres.map(c => (
              <div key={c.label} className="flex-shrink-0 min-w-[96px] rounded-xl bg-slate-50 border border-slate-200/80 px-3 py-2 sm:px-4 sm:py-2.5">
                <div className="text-[11px] sm:text-[12px] text-gray-500 whitespace-nowrap">{c.label}</div>
                <div className={["chiffre text-[16px] sm:text-[19px] font-extrabold leading-tight mt-0.5 whitespace-nowrap", TONS[c.ton ?? "neutre"]].join(" ")}>
                  {c.valeur}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
