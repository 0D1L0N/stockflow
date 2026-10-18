import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, Search } from "lucide-react";

export interface DropdownOption {
  value: string | number;
  label: string;
  sublabel?: string;
}

interface DropdownProps {
  options: DropdownOption[];
  value?: string | number;
  onChange: (value: string | number) => void;
  placeholder?: string;
  searchable?: boolean;
  className?: string;
}

export default function Dropdown({ options, value, onChange, placeholder = "Sélectionner…", searchable = false, className = "" }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));
  const selected = options.find(o => o.value === value);

  return (
    <div ref={ref} className={["relative", className].join(" ")}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={[
          "w-full flex items-center gap-2 px-3 py-2.5 bg-white border rounded-lg text-sm transition-colors",
          open ? "border-secondary ring-2 ring-secondary/20" : "border-gray-300 hover:border-gray-400",
        ].join(" ")}
      >
        <span className={["flex-1 text-left truncate", selected ? "text-gray-800 font-medium" : "text-gray-400"].join(" ")}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={16} className={["text-gray-400 transition-transform flex-shrink-0", open ? "rotate-180" : ""].join(" ")} />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-gray-200 rounded-lg shadow-modal overflow-hidden">
          {searchable && (
            <div className="p-2 border-b border-gray-100">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  autoFocus
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Rechercher…"
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:border-secondary"
                />
              </div>
            </div>
          )}
          <div className="max-h-52 overflow-y-auto">
            {filtered.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); setSearch(""); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{opt.label}</div>
                  {opt.sublabel && <div className="text-xs text-gray-500">{opt.sublabel}</div>}
                </div>
                {opt.value === value && <Check size={14} className="text-secondary flex-shrink-0" />}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-sm text-gray-400 text-center">Aucun résultat</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
