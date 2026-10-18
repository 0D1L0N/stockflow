import { type InputHTMLAttributes, type ReactNode } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: ReactNode;
}

export default function Input({ label, error, icon, className = "", id, ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">{icon}</div>
        )}
        <input
          id={inputId}
          className={[
            "w-full h-11 rounded-xl border bg-white px-3.5 text-sm text-gray-800",
            "placeholder:text-gray-400 transition-all duration-150",
            "focus:outline-none focus:ring-4 focus:ring-secondary/15 focus:border-secondary",
            "disabled:bg-slate-50 disabled:text-gray-500",
            error ? "border-danger" : "border-slate-300 hover:border-slate-400",
            icon ? "pl-10" : "",
            className,
          ].join(" ")}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-danger font-medium">{error}</p>}
    </div>
  );
}
