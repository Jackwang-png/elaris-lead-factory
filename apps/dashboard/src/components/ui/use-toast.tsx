"use client";
import * as React from "react";

type ToastProps = {
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
};
type Toast = ToastProps & { id: number };

const ToastContext = React.createContext<{ toasts: Toast[]; toast: (t: ToastProps) => void }>({
  toasts: [],
  toast: () => {},
});

let idCounter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const toast = React.useCallback((t: ToastProps) => {
    const id = ++idCounter;
    setToasts((old) => [...old, { ...t, id }]);
    setTimeout(() => setToasts((old) => old.filter((x) => x.id !== id)), 4000);
  }, []);
  return <ToastContext.Provider value={{ toasts, toast }}>{children}</ToastContext.Provider>;
}

export function useToast() {
  return React.useContext(ToastContext);
}

export const toast = (t: ToastProps) => {
  // 全局调用：通过 window 事件触发 provider
  window.dispatchEvent(new CustomEvent("app-toast", { detail: t }));
};
