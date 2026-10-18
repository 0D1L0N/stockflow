import { type ReactNode } from "react";

interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

/** En-tête de page : reste visible en haut, actions à droite (passent dessous sur petit écran). */
export default function Header({ title, subtitle, actions }: HeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 sm:px-6 pb-3.5 sm:pb-4 pt-[calc(0.875rem+env(safe-area-inset-top))] sm:pt-[calc(1rem+env(safe-area-inset-top))] bg-white/90 backdrop-blur border-b border-slate-200/70 flex-shrink-0">
      <div className="min-w-0">
        <h1 className="font-extrabold text-gray-900 text-lg sm:text-xl tracking-tight leading-tight truncate">{title}</h1>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5 truncate">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
