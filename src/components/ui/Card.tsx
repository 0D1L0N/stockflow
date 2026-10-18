import { type ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: "sm" | "md" | "lg" | "none";
  onClick?: () => void;
}

const paddings = { none: "", sm: "p-3", md: "p-4", lg: "p-6" };

export default function Card({ children, className = "", padding = "md", onClick }: CardProps) {
  return (
    <div
      className={[
        "bg-white rounded-2xl shadow-card border border-slate-200/70",
        paddings[padding],
        onClick ? "cursor-pointer transition-all duration-200 hover:shadow-card-hover hover:border-slate-300/70 active:scale-[0.99]" : "",
        className,
      ].join(" ")}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
