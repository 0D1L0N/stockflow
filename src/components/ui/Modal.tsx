import { type ReactNode, useEffect } from "react";
import { X } from "lucide-react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "full";
}

const sizes = {
  sm:   "sm:max-w-sm",
  md:   "sm:max-w-lg",
  lg:   "sm:max-w-2xl",
  full: "sm:max-w-full sm:mx-4",
};

/** Fenêtre modale : panneau qui monte du bas sur téléphone, centrée sur grand écran. */
export default function Modal({ isOpen, onClose, title, children, size = "md" }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (isOpen) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div className={[
        "relative w-full bg-white shadow-modal flex flex-col animate-slide-up",
        "rounded-t-3xl sm:rounded-2xl max-h-[92vh] sm:max-h-[90vh] pb-safe",
        sizes[size],
      ].join(" ")}>
        {/* Poignée visuelle sur téléphone */}
        <div className="sm:hidden flex justify-center pt-2.5">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>
        {title && (
          <div className="flex items-center justify-between gap-3 px-6 pt-3 pb-4 sm:pt-5 border-b border-slate-100 flex-shrink-0">
            <h2 className="font-bold text-gray-900 text-base truncate">{title}</h2>
            <button onClick={onClose} aria-label="Fermer"
              className="p-2 -mr-2 rounded-full hover:bg-slate-100 text-gray-400 hover:text-gray-600 transition-colors">
              <X size={18} />
            </button>
          </div>
        )}
        <div className="overflow-y-auto flex-1 overscroll-contain">{children}</div>
      </div>
    </div>
  );
}
