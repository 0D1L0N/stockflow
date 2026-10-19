import { type InputHTMLAttributes, type ReactNode } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: ReactNode;
}

export default function Input({ label, error, icon, className = "", id, ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
  // Champ numérique : pavé numérique sur téléphone (avec virgule si le champ accepte des décimales)
  const inputMode = props.inputMode
    ?? (props.type === "number" ? (String(props.step ?? "").includes(".") ? "decimal" : "numeric") : undefined);
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-[13px] font-medium text-gray-700">
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
            "w-full h-11 sm:h-10 rounded-lg border bg-white px-3 text-sm text-gray-900 shadow-sm",
            "placeholder:text-gray-400 transition-all duration-150",
            "focus:outline-none focus:ring-2 focus:ring-secondary/25 focus:border-secondary-600",
            "disabled:bg-slate-50 disabled:text-gray-500",
            error ? "border-danger" : "border-slate-300",
            icon ? "pl-10" : "",
            className,
          ].join(" ")}
          {...props}
          inputMode={inputMode}
        />
      </div>
      {error && <p className="text-xs text-danger font-medium">{error}</p>}
    </div>
  );
}
