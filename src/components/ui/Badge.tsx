import { type ReactNode } from "react";

interface BadgeProps {
  variant?: "success" | "warning" | "danger" | "info" | "default";
  children: ReactNode;
  className?: string;
}

const variants = {
  success: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
  warning: "bg-amber-50 text-amber-700 ring-amber-600/20",
  danger:  "bg-red-50 text-red-700 ring-red-600/15",
  info:    "bg-blue-50 text-blue-700 ring-blue-600/15",
  default: "bg-slate-100 text-slate-600 ring-slate-500/10",
};

export default function Badge({ variant = "default", children, className = "" }: BadgeProps) {
  return (
    <span className={[
      "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 ring-inset whitespace-nowrap",
      variants[variant], className,
    ].join(" ")}>
      {children}
    </span>
  );
}
