"use client";

import { CircleAlert, CircleCheck, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Toast = { id: number; title: string; description?: string; tone: "success" | "error" };
type ToastInput = Omit<Toast, "id" | "tone"> & { tone?: Toast["tone"] };

const ToastContext = createContext<(toast: ToastInput) => void>(() => {});

/** Show a short status message, like the reference's display-status component. */
export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-2), { id, tone: "success", ...input }]);
      window.setTimeout(() => dismiss(id), 4500);
    },
    [dismiss],
  );

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[300] flex flex-col items-end gap-2 sm:left-auto sm:right-6 sm:w-96"
        data-print-hide
      >
        {toasts.map((toast) => {
          const Icon = toast.tone === "success" ? CircleCheck : CircleAlert;
          return (
            <div
              key={toast.id}
              role="status"
              className="animate-toast-in pointer-events-auto flex w-full items-start gap-3 rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg"
            >
              <Icon className={cn("mt-0.5 size-4 shrink-0", toast.tone === "success" ? "text-success" : "text-destructive")} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{toast.title}</p>
                {toast.description && <p className="mt-1 text-sm text-muted-foreground">{toast.description}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="rounded-sm text-muted-foreground hover:text-foreground"
                aria-label="Dismiss"
              >
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
