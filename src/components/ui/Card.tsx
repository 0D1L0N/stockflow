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
        "bg-white rounded-xl shadow-card border border-slate-200",
        paddings[padding],
        onClick ? "cursor-pointer transition-colors duration-150 hover:border-slate-300 hover:bg-slate-50/60 active:bg-slate-50" : "",
        className,
      ].join(" ")}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
