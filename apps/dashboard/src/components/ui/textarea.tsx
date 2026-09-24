import * as React from "react";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className = "", ...props }, ref) => (
    <textarea
      ref={ref}
      className={`
        flex min-h-[88px] w-full
        rounded-[10px]
        border border-[color:var(--border-default)]
        bg-[color:var(--bg-surface)]
        px-3.5 py-2.5
        text-[13.5px] leading-[1.6]
        text-[color:var(--text-primary)]
        placeholder:text-[color:var(--text-muted)]
        resize-y
        transition-all duration-[160ms] ease-[cubic-bezier(0.16,1,0.3,1)]
        hover:border-[color:var(--border-strong)]
        focus:outline-none
        focus:border-[color:var(--accent)]
        focus:shadow-[0_0_0_3px_var(--accent-soft)]
        focus:bg-[color:var(--bg-card)]
        disabled:opacity-45 disabled:cursor-not-allowed
        ${className}
      `}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";
