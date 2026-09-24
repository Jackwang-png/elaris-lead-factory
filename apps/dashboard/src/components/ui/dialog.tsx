import * as React from "react";

const DialogContext = React.createContext<{
  open: boolean;
  setOpen: (v: boolean) => void;
}>({ open: false, setOpen: () => {} });

export function Dialog({ open, onOpenChange, children }: {
  open: boolean; onOpenChange?: (v: boolean) => void; children: React.ReactNode;
}) {
  const [internalOpen, setInternalOpen] = React.useState(open);
  const isOpen = onOpenChange ? open : internalOpen;
  const setOpen = (v: boolean) => {
    if (onOpenChange) onOpenChange(v);
    else setInternalOpen(v);
  };
  return <DialogContext.Provider value={{ open: isOpen, setOpen }}>{children}</DialogContext.Provider>;
}

export function DialogTrigger({ asChild, children }: {
  asChild?: boolean; children: React.ReactNode;
}) {
  const { setOpen } = React.useContext(DialogContext);
  const handleClick = (e: React.MouseEvent) => {
    e?.stopPropagation?.();
    setOpen(true);
  };
  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<any>;
    return React.cloneElement(child, {
      onClick: (e: React.MouseEvent) => {
        handleClick(e);
        child.props?.onClick?.(e);
      },
    });
  }
  return (
    <span onClick={handleClick} style={{ cursor: "pointer" }}>
      {children}
    </span>
  );
}

/**
 * DialogContent — 极简高级弹窗
 * - 毛玻璃遮罩
 * - 卡片：大圆角 + 柔和阴影 + 微边框
 * - 入场缩放 + 淡入
 */
export function DialogContent({ className = "", style, children }: {
  className?: string; style?: React.CSSProperties; children: React.ReactNode;
}) {
  const { open, setOpen } = React.useContext(DialogContext);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(6px) saturate(140%)",
        WebkitBackdropFilter: "blur(6px) saturate(140%)",
        animation: "fadeIn 180ms ease-out",
      }}
      onClick={() => setOpen(false)}
    >
      <div
        className={`w-full max-w-lg ${className}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-default)",
          borderRadius: 20,
          padding: 26,
          boxShadow: "var(--shadow-lg)",
          animation: "popIn 220ms cubic-bezier(0.16, 1, 0.3, 1)",
          ...style,
        }}
      >
        {children}
        <style>{`
          @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
          @keyframes popIn {
            0%   { opacity: 0; transform: translateY(8px) scale(0.97) }
            100% { opacity: 1; transform: translateY(0) scale(1) }
          }
        `}</style>
      </div>
    </div>
  );
}

export function DialogHeader({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`mb-5 flex flex-col space-y-1.5 ${className}`}
      {...props}
    />
  );
}

export function DialogTitle({ className = "", ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={`
        text-[18px] font-semibold
        tracking-[-0.015em]
        text-[color:var(--text-primary)]
        ${className}
      `}
      {...props}
    />
  );
}
