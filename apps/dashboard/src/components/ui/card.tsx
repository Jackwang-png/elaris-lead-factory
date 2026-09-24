import * as React from "react";

/**
 * 极简高级风格 Card
 * - 柔和边框、细腻阴影
 * - 悬停时微抬升 + 边框高亮
 */
export function Card({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`
        rounded-[16px]
        bg-[color:var(--bg-card)]
        border border-[color:var(--border-default)]
        shadow-[0_2px_6px_rgba(0,0,0,0.28),0_1px_2px_rgba(0,0,0,0.18)]
        transition-all duration-[220ms] ease-[cubic-bezier(0.16,1,0.3,1)]
        hover:border-[color:var(--border-strong)]
        hover:shadow-[0_6px_18px_rgba(0,0,0,0.32),0_2px_4px_rgba(0,0,0,0.18)]
        ${className}
      `}
      {...props}
    />
  );
}

export function CardHeader({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`flex flex-col space-y-1 p-6 ${className}`}
      {...props}
    />
  );
}

export function CardTitle({ className = "", ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={`
        text-[17px] font-semibold leading-none
        tracking-[-0.015em]
        text-[color:var(--text-primary)]
        ${className}
      `}
      {...props}
    />
  );
}

export function CardDescription({ className = "", ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={`text-[13px] text-[color:var(--text-tertiary)] ${className}`}
      {...props}
    />
  );
}

export function CardContent({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`p-6 pt-0 ${className}`} {...props} />;
}

export function CardFooter({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`flex items-center p-6 pt-0 gap-2 ${className}`}
      {...props}
    />
  );
}
