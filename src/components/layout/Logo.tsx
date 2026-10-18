/** Logo StockFlow : pictogramme casier + nom. `clair` pour les fonds sombres. */
export default function Logo({ clair = true, taille = "md", sousTitre }: {
  clair?: boolean; taille?: "md" | "lg"; sousTitre?: string;
}) {
  const grand = taille === "lg";
  return (
    <div className={["flex items-center", grand ? "flex-col gap-3" : "gap-2.5"].join(" ")}>
      <div className={[
        "rounded-xl bg-gradient-to-br from-secondary-400 to-secondary-600 flex items-center justify-center shadow-glow flex-shrink-0",
        grand ? "w-16 h-16 rounded-2xl" : "w-9 h-9",
      ].join(" ")}>
        {/* Casier vu de face : 3 × 2 bouteilles */}
        <svg viewBox="0 0 24 24" className={grand ? "w-9 h-9" : "w-5 h-5"} fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
          <rect x="3" y="6" width="18" height="13" rx="2" />
          <path d="M3 11h18M9 6v13M15 6v13" />
        </svg>
      </div>
      <div className={grand ? "text-center" : ""}>
        <div className={[
          "font-extrabold tracking-tight leading-none",
          grand ? "text-3xl" : "text-lg",
          clair ? "text-white" : "text-primary",
        ].join(" ")}>
          Stock<span className="text-secondary-400">Flow</span>
        </div>
        {sousTitre && (
          <div className={["mt-1", grand ? "text-sm" : "text-[11px]", clair ? "text-white/50" : "text-gray-500"].join(" ")}>{sousTitre}</div>
        )}
      </div>
    </div>
  );
}
