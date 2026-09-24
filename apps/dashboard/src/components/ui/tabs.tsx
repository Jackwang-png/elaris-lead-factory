import * as React from "react";

const TabsContext = React.createContext<{ value?: string; onChange?: (v: string) => void }>({});

export function Tabs({ value, onValueChange, children }: {
  value?: string; onValueChange?: (v: string) => void; children: React.ReactNode;
}) {
  return <TabsContext.Provider value={{ value, onChange: onValueChange }}>{children}</TabsContext.Provider>;
}

/**
 * TabsList — 极简分段控制器
 * - 半透明磨砂容器
 * - 选中卡片微浮起 + 柔光
 */
export function TabsList({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`
        inline-flex h-10 items-center
        rounded-[10px]
        bg-[color:rgba(255,255,255,0.035)]
        border border-[color:var(--border-default)]
        p-1
        gap-0.5
        ${className}
      `}
      {...props}
    />
  );
}

export function TabsTrigger({ value, className = "", children }: {
  value: string; className?: string; children: React.ReactNode;
}) {
  const ctx = React.useContext(TabsContext);
  const active = ctx.value === value;
  return (
    <button
      type="button"
      className={`
        inline-flex items-center justify-center whitespace-nowrap
        rounded-[8px]
        px-3.5 py-1.5
        text-[13px] font-medium
        transition-all duration-[200ms] ease-[cubic-bezier(0.16,1,0.3,1)]
        ${active
          ? "bg-[color:var(--bg-card)] text-[color:var(--text-primary)] " +
            "shadow-[0_1px_2px_rgba(0,0,0,0.25),0_0_0_1px_var(--border-strong)]"
          : "text-[color:var(--text-tertiary)] " +
            "hover:text-[color:var(--text-secondary)] hover:bg-[color:rgba(255,255,255,0.03)]"
        }
        ${className}
      `}
      onClick={() => ctx.onChange?.(value)}
    >
      {children}
    </button>
  );
}

export function TabsContent({ value, children }: {
  value: string; children: React.ReactNode;
}) {
  const ctx = React.useContext(TabsContext);
  if (ctx.value !== undefined && ctx.value !== value) return null;
  return <div className="animate-in fade-in duration-300">{children}</div>;
}
