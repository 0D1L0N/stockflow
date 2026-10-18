interface SkeletonProps {
  variant?: "text" | "card" | "table-row";
  count?: number;
  className?: string;
}

function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={["animate-pulse bg-slate-200/80 rounded-md", className].join(" ")} />;
}

export default function Skeleton({ variant = "text", count = 1, className = "" }: SkeletonProps) {
  const items = Array.from({ length: count });

  if (variant === "card") {
    return (
      <>
        {items.map((_, i) => (
          <div key={i} className={["bg-white rounded-2xl shadow-card border border-slate-200/70 p-4 space-y-3", className].join(" ")}>
            <SkeletonLine className="h-4 w-3/4" />
            <SkeletonLine className="h-3 w-1/2" />
            <SkeletonLine className="h-8 w-full" />
          </div>
        ))}
      </>
    );
  }

  if (variant === "table-row") {
    return (
      <>
        {items.map((_, i) => (
          <div key={i} className={["flex gap-4 items-center py-3 px-4 border-b border-gray-100", className].join(" ")}>
            <SkeletonLine className="h-4 w-24" />
            <SkeletonLine className="h-4 flex-1" />
            <SkeletonLine className="h-4 w-16" />
            <SkeletonLine className="h-4 w-20" />
          </div>
        ))}
      </>
    );
  }

  return (
    <>
      {items.map((_, i) => (
        <SkeletonLine key={i} className={["h-4 w-full", className].join(" ")} />
      ))}
    </>
  );
}
