import * as React from "react";

type Variant = "default" | "outline" | "destructive" | "ghost" | "secondary" | "link";
type Size = "default" | "sm" | "lg" | "icon";

/**
 * 极简高级风格 Button
 * 设计要点：克制阴影、细腻hover、纯色主色、active微缩
 */
const base =
  "inline-flex items-center justify-center select-none " +
  "font-medium whitespace-nowrap rounded-[10px] " +
  "transition-all duration-[200ms] ease-[cubic-bezier(0.16,1,0.3,1)] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 " +
  "focus-visible:ring-offset-[#0b0d12] disabled:opacity-45 disabled:pointer-events-none " +
  "active:scale-[0.98]";

const variantClass: Record<Variant, string> = {
  default:
    "text-white " +
    "bg-[color:var(--accent)] " +
    "shadow-[0_1px_2px_rgba(0,0,0,0.28),0_4px_12px_var(--accent-glow)] " +
    "hover:bg-[color:var(--accent-hover)]",
  outline:
    "text-[color:var(--text-primary)] " +
    "bg-transparent " +
    "border border-[color:var(--border-strong)] " +
    "hover:bg-[color:var(--bg-hover)] hover:border-[color:rgba(255,255,255,0.18)]",
  destructive:
    "text-white " +
    "bg-[color:var(--danger)] " +
    "shadow-[0_1px_2px_rgba(0,0,0,0.28),0_4px_12px_rgba(248,113,113,0.18)] " +
    "hover:brightness-110",
  ghost:
    "text-[color:var(--text-secondary)] " +
    "bg-transparent " +
    "hover:text-[color:var(--text-primary)] hover:bg-[color:var(--bg-hover)]",
  secondary:
    "text-[color:var(--text-primary)] " +
    "bg-[color:var(--bg-card)] " +
    "border border-[color:var(--border-default)] " +
    "hover:bg-[color:var(--bg-hover)] hover:border-[color:var(--border-strong)]",
  link:
    "text-[color:var(--accent)] underline-offset-4 hover:underline bg-transparent",
};

const sizeClass: Record<Size, string> = {
  default: "h-10 px-4 text-[13.5px] tracking-[0.005em]",
  sm: "h-8 px-3 text-[12px]",
  lg: "h-11 px-6 text-[14.5px]",
  icon: "h-10 w-10",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "default", size = "default", ...props }, ref) => (
    <button
      ref={ref}
      className={`${base} ${variantClass[variant]} ${sizeClass[size]} ${className}`}
      {...props}
    />
  )
);
Button.displayName = "Button";
