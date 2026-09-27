'use client';

import * as React from "react";

interface SelectContextValue {
  value?: string;
  onChange?: (v: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  items: Map<string, string>;
}

const SelectContext = React.createContext<SelectContextValue | null>(null);

function useSelectContext(): SelectContextValue {
  const ctx = React.useContext(SelectContext);
  if (!ctx) throw new Error("Select components must be used within <Select>");
  return ctx;
}

// 纯 React 树遍历提取文本，避免脆弱的 DOM hack
function extractText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (React.isValidElement(node)) {
    return extractText((node.props as { children?: React.ReactNode }).children);
  }
  return "";
}

// 同步收集所有 SelectItem 的 value→label 映射（即使 Content 未展开也能解析首屏 label，无闪烁）
function collectItems(children: React.ReactNode, map: Map<string, string>) {
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    if (child.type === SelectItem) {
      const p = child.props as { value: string; label?: string; children?: React.ReactNode };
      const label = p.label ?? extractText(p.children);
      if (label) map.set(p.value, label);
    } else {
      const c = (child.props as { children?: React.ReactNode }).children;
      if (c) collectItems(c, map);
    }
  });
}

export function Select({
  value,
  onValueChange,
  children,
}: {
  value?: string;
  onValueChange?: (v: string) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  const items = React.useMemo(() => {
    const m = new Map<string, string>();
    collectItems(children, m);
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children]);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <SelectContext.Provider value={{ value, onChange: onValueChange, open, setOpen, items }}>
      <div ref={wrapperRef} style={{ position: "relative", display: "block" }}>
        {children}
        <style>{`
          .wanlan-select-trigger {
            display: flex;
            align-items: center;
            justify-content: space-between;
            height: 40px;
            padding: 0 12px;
            border-radius: 10px;
            border: 1px solid var(--border-default);
            background: var(--bg-surface);
            font-size: 13.5px;
            color: var(--text-secondary);
            cursor: pointer;
            transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
          }
          .wanlan-select-trigger:hover { border-color: var(--border-strong); }
          .wanlan-select-trigger:focus-visible {
            outline: none;
            border-color: var(--accent);
            box-shadow: 0 0 0 3px var(--accent-soft);
            background: var(--bg-card);
          }
          .wanlan-select-item {
            cursor: pointer;
            padding: 8px 12px;
            font-size: 13.5px;
            color: var(--text-secondary);
            white-space: nowrap;
          }
          .wanlan-select-item:hover { background: var(--bg-surface); }
          .wanlan-select-chevron { transition: transform 160ms ease; flex-shrink: 0; color: var(--text-tertiary); }
          .wanlan-select-chevron[data-open="true"] { transform: rotate(180deg); }
        `}</style>
      </div>
    </SelectContext.Provider>
  );
}

export function SelectTrigger({
  className = "",
  children,
  onClick,
  onKeyDown,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const { open, setOpen } = useSelectContext();
  return (
    <div
      role="button"
      tabIndex={0}
      className={`wanlan-select-trigger ${className}`}
      onClick={(e) => {
        onClick?.(e);
        setOpen(!open);
      }}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen(!open);
        }
      }}
      {...props}
    >
      {children}
      <svg
        className="wanlan-select-chevron"
        data-open={open ? "true" : "false"}
        width="16"
        height="16"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
          clipRule="evenodd"
        />
      </svg>
    </div>
  );
}

export function SelectValue({ placeholder }: { placeholder?: string }) {
  const { value, items } = useSelectContext();
  const label = value ? items.get(value) : undefined;
  return <span>{label || placeholder || ""}</span>;
}

export function SelectContent({
  className = "",
  style,
  children,
}: {
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const { open } = useSelectContext();
  if (!open) return null;
  return (
    <div
      className={className}
      style={{
        position: "absolute",
        top: "100%",
        left: 0,
        minWidth: "100%",
        marginTop: 4,
        zIndex: 50,
        maxHeight: 280,
        overflow: "auto",
        background: "var(--bg-card)",
        border: "1px solid var(--border-strong)",
        borderRadius: 12,
        boxShadow: "var(--shadow-md)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function SelectItem({
  value,
  children,
}: {
  value: string;
  label?: string;
  children?: React.ReactNode;
}) {
  const { value: selectedValue, onChange, setOpen } = useSelectContext();
  const selected = selectedValue === value;
  return (
    <div
      className="wanlan-select-item"
      style={
        selected
          ? { background: "var(--accent-soft)", color: "var(--accent)", fontWeight: 600 }
          : undefined
      }
      onClick={() => {
        onChange?.(value);
        setOpen(false);
      }}
    >
      {children}
    </div>
  );
}
