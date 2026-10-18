/** Logo StockFlow : pictogramme casier + nom. `clair` = sur fond sombre (encre). */
export default function Logo({ clair = true, taille = "md", sousTitre }: {
  clair?: boolean; taille?: "md" | "lg"; sousTitre?: string;
}) {
  const grand = taille === "lg";
  return (
    <div className={["flex items-center", grand ? "flex-col gap-3" : "gap-2.5"].join(" ")}>
      <div className={[
        "flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-secondary-400 to-secondary-600",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_6px_16px_-6px_rgba(16,185,129,0.6)]",
        grand ? "w-14 h-14 rounded-2xl" : "w-9 h-9 rounded-[10px]",
      ].join(" ")}>
        {/* Casier vu de face : 3 × 2 bouteilles */}
        <svg viewBox="0 0 24 24" className={grand ? "w-8 h-8" : "w-5 h-5"} fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
          <rect x="3" y="6" width="18" height="13" rx="2.5" />
          <path d="M3 11.5h18M9 6v13M15 6v13" />
        </svg>
      </div>
      <div className={grand ? "text-center" : ""}>
        <div className={[
          "font-display font-extrabold tracking-[-0.03em] leading-none",
          grand ? "text-[30px]" : "text-[18px]",
          clair ? "text-white" : "text-ink-900",
        ].join(" ")}>
          Stock<span className={clair ? "text-secondary-400" : "text-secondary-600"}>Flow</span>
        </div>
        {sousTitre && (
          <div className={["mt-1", grand ? "text-sm" : "text-[11px]", clair ? "text-ink-400" : "text-gray-500"].join(" ")}>{sousTitre}</div>
        )}
      </div>
    </div>
  );
}
