import * as React from "react";

/**
 * Badge — 极简胶囊标签
 * 全部走柔和半透明底 + 彩色字，保证克制
 */
const variants: Record<string, string> = {
  default:
    "bg-[color:var(--accent-soft)] text-[color:var(--accent)] " +
    "border border-[color:rgba(59,130,246,0.18)]",
  secondary:
    "bg-[color:rgba(255,255,255,0.04)] text-[color:var(--text-secondary)] " +
    "border border-[color:var(--border-default)]",
  destructive:
    "bg-[color:var(--danger-soft)] text-[color:var(--danger)] " +
    "border border-[color:rgba(248,113,113,0.18)]",
  outline:
    "bg-transparent text-[color:var(--text-secondary)] " +
    "border border-[color:var(--border-strong)]",
  success:
    "bg-[color:var(--success-soft)] text-[color:var(--success)] " +
    "border border-[color:rgba(52,211,153,0.18)]",
  warning:
    "bg-[color:var(--warning-soft)] text-[color:var(--warning)] " +
    "border border-[color:rgba(251,191,36,0.2)]",
  info:
    "bg-[color:var(--info-soft)] text-[color:var(--info)] " +
    "border border-[color:rgba(96,165,250,0.2)]",
};

export function Badge({
  className = "",
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: string }) {
  return (
    <span
      className={`
        inline-flex items-center gap-1
        rounded-full
        px-2.5 py-0.5 h-5
        text-[11px] font-medium
        ${variants[variant] || variants.default}
        ${className}
      `}
      {...props}
    />
  );
}
