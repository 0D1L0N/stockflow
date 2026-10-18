import { type ReactNode } from "react";

interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

/**
 * En-tête de page. Son contenu suit la même colonne centrée que les listes
 * (max-w-4xl) pour rester aligné sur grand écran ; les actions passent dessous
 * sur petit écran.
 */
export default function Header({ title, subtitle, actions }: HeaderProps) {
  return (
    <div className="bg-white border-b border-slate-200 flex-shrink-0 px-4 sm:px-6 pb-3.5 sm:pb-5 pt-[calc(0.875rem+env(safe-area-inset-top))] sm:pt-[calc(1.25rem+env(safe-area-inset-top))]">
      <div className="w-full max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="font-bold text-gray-900 text-lg sm:text-[22px] tracking-tight leading-tight truncate">{title}</h1>
          {subtitle && <p className="text-[13px] text-gray-500 mt-0.5 truncate">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
      </div>
    </div>
  );
}
