/** Logo StockFlow : pictogramme casier + nom. `clair` pour les fonds sombres. */
export default function Logo({ clair = true, taille = "md", sousTitre }: {
  clair?: boolean; taille?: "md" | "lg"; sousTitre?: string;
}) {
  const grand = taille === "lg";
  return (
    <div className={["flex items-center", grand ? "flex-col gap-3" : "gap-2.5"].join(" ")}>
      <div className={[
        "rounded-lg bg-primary-700 flex items-center justify-center flex-shrink-0",
        grand ? "w-14 h-14 rounded-2xl" : "w-8 h-8",
      ].join(" ")}>
        {/* Casier vu de face : 3 × 2 bouteilles */}
        <svg viewBox="0 0 24 24" className={grand ? "w-8 h-8" : "w-[18px] h-[18px]"} fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round">
          <rect x="3" y="6" width="18" height="13" rx="2" />
          <path d="M3 11h18M9 6v13M15 6v13" />
        </svg>
      </div>
      <div className={grand ? "text-center" : ""}>
        <div className={[
          "font-bold tracking-tight leading-none",
          grand ? "text-[28px]" : "text-[17px]",
          clair ? "text-white" : "text-gray-900",
        ].join(" ")}>
          Stock<span className={clair ? "text-secondary-400" : "text-secondary-600"}>Flow</span>
        </div>
        {sousTitre && (
          <div className={["mt-1", grand ? "text-sm" : "text-[11px]", clair ? "text-white/50" : "text-gray-500"].join(" ")}>{sousTitre}</div>
        )}
      </div>
    </div>
  );
}
