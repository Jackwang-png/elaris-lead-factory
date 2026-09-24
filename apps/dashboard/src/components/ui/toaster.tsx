"use client";
import * as React from "react";
import { useToast } from "./use-toast";

export function Toaster() {
  const { toasts } = useToast();
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`rounded-md border px-4 py-3 text-sm shadow-lg ${
            t.variant === "destructive" ? "border-red-200 bg-red-50 text-red-800" : "border-gray-200 bg-white text-gray-900"
          }`}
        >
          {t.title && <div className="font-medium">{t.title}</div>}
          {t.description && <div className="text-gray-600">{t.description}</div>}
        </div>
      ))}
    </div>
  );
}
