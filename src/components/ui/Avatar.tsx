// Couleurs douces, assez contrastées pour les initiales (fond 100 / texte 700)
const PALETTE = [
  "bg-emerald-100 text-emerald-700",
  "bg-sky-100 text-sky-700",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-700",
  "bg-violet-100 text-violet-700",
  "bg-teal-100 text-teal-700",
  "bg-orange-100 text-orange-700",
  "bg-indigo-100 text-indigo-700",
  "bg-lime-100 text-lime-800",
  "bg-fuchsia-100 text-fuchsia-700",
];

/** Même nom → même couleur, sur tous les écrans et tous les appareils. */
function couleur(nom: string): string {
  let h = 0;
  for (const c of nom.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function initiales(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return "?";
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase();
  return (mots[0][0] + mots[1][0]).toUpperCase();
}

const TAILLES = {
  sm: "w-8 h-8 text-[11px] rounded-lg",
  md: "w-10 h-10 text-xs rounded-xl",
  lg: "w-12 h-12 text-sm rounded-xl",
};

/** Pastille colorée aux initiales : repère visuel d'un produit ou d'un client. */
export default function Avatar({ nom, taille = "md", rond = false, className = "" }: {
  nom: string; taille?: keyof typeof TAILLES; rond?: boolean; className?: string;
}) {
  return (
    <span aria-hidden className={[
      "inline-flex items-center justify-center font-display font-bold flex-shrink-0 select-none",
      TAILLES[taille], rond ? "!rounded-full" : "", couleur(nom), className,
    ].join(" ")}>
      {initiales(nom)}
    </span>
  );
}
