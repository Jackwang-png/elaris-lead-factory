import * as React from "react";

/**
 * 极简高级风格 Input
 * - 柔和边框，悬停变深
 * - 聚焦：主色描边 + 3px 柔光 halo
 */
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className = "", ...props }, ref) => (
    <input
      ref={ref}
      className={`
        flex h-10 w-full
        rounded-[10px]
        border border-[color:var(--border-default)]
        bg-[color:var(--bg-surface)]
        px-3.5 py-2
        text-[13.5px]
        text-[color:var(--text-primary)]
        placeholder:text-[color:var(--text-muted)]
        transition-all duration-[160ms] ease-[cubic-bezier(0.16,1,0.3,1)]
        hover:border-[color:var(--border-strong)]
        focus:outline-none
        focus:border-[color:var(--accent)]
        focus:shadow-[0_0_0_3px_var(--accent-soft)]
        focus:bg-[color:var(--bg-card)]
        disabled:opacity-45 disabled:cursor-not-allowed
        file:border-0 file:bg-transparent file:text-sm file:font-medium
        ${className}
      `}
      {...props}
    />
  )
);
Input.displayName = "Input";
