import * as React from "react";

const SelectContext = React.createContext<{ value?: string; onChange?: (v: string) => void }>({});

export function Select({ value, onValueChange, children }: { value?: string; onValueChange?: (v: string) => void; children: React.ReactNode }) {
  return <SelectContext.Provider value={{ value, onChange: onValueChange }}>{children}</SelectContext.Provider>;
}
export function SelectTrigger({ className = "", children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`flex h-10 w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ${className}`} {...props}>{children}</div>;
}
export function SelectValue({ placeholder }: { placeholder?: string }) {
  const { value } = React.useContext(SelectContext);
  return <span className="text-gray-700">{value || placeholder || ""}</span>;
}
export function SelectContent({ className = "", style, children }: { className?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  return <div className={`mt-1 rounded-md border border-gray-200 bg-white shadow-sm ${className}`} style={style}>{children}</div>;
}
export function SelectItem({ value, children }: { value: string; children: React.ReactNode }) {
  const ctx = React.useContext(SelectContext);
  return (
    <div
      className={`cursor-pointer px-3 py-2 text-sm hover:bg-gray-100 ${ctx.value === value ? "bg-blue-50 font-medium" : ""}`}
      onClick={() => ctx.onChange?.(value)}
    >
      {children}
    </div>
  );
}
