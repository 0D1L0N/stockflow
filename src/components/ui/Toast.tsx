import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { CheckCircle, XCircle, AlertTriangle, Info, X } from "lucide-react";

type ToastVariant = "success" | "error" | "warning" | "info";

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

const icons = {
  success: <CheckCircle size={18} className="text-green-500 flex-shrink-0" />,
  error:   <XCircle    size={18} className="text-red-500 flex-shrink-0" />,
  warning: <AlertTriangle size={18} className="text-orange-500 flex-shrink-0" />,
  info:    <Info       size={18} className="text-blue-500 flex-shrink-0" />,
};

const borders = {
  success: "border-l-4 border-emerald-500",
  error:   "border-l-4 border-red-500",
  warning: "border-l-4 border-orange-500",
  info:    "border-l-4 border-blue-500",
};

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, variant: ToastVariant = "info") => {
    const id = ++nextId;
    setToasts(prev => [...prev, { id, message, variant }]);
    // Les erreurs restent un peu plus longtemps : elles demandent souvent une action
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), variant === "error" ? 5000 : 3500);
  }, []);

  const remove = (id: number) => setToasts(prev => prev.filter(t => t.id !== id));

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed top-3 left-3 right-3 sm:left-auto sm:right-4 sm:top-4 z-[100] flex flex-col gap-2 sm:w-96 pt-safe pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} role="status" className={["pointer-events-auto bg-white rounded-xl shadow-modal ring-1 ring-slate-900/5 p-3.5 flex items-start gap-3 animate-slide-in-right", borders[t.variant]].join(" ")}>
            {icons[t.variant]}
            <p className="text-sm text-gray-700 font-medium flex-1">{t.message}</p>
            <button onClick={() => remove(t.id)} className="text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
