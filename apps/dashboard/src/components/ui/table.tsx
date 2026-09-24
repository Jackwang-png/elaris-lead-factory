import * as React from "react";

/**
 * Table — 极简高级表格
 * - 行高舒适，分割线轻
 * - 悬停柔和高亮
 */
export function Table({ className = "", ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-auto rounded-[12px] border border-[color:var(--border-default)]">
      <table
        className={`w-full caption-bottom text-[13.5px] ${className}`}
        {...props}
      />
    </div>
  );
}

export function TableHeader({ className = "", ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={`
        border-b border-[color:var(--border-default)]
        bg-[color:rgba(255,255,255,0.02)]
        [&_tr]:hover:bg-transparent
        ${className}
      `}
      {...props}
    />
  );
}

export function TableBody({ className = "", ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody
      className={`[&_tr:last-child]:border-0 ${className}`}
      {...props}
    />
  );
}

export function TableRow({ className = "", ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={`
        border-b border-[color:var(--border-subtle)]
        transition-colors duration-150
        hover:bg-[color:rgba(255,255,255,0.025)]
        ${className}
      `}
      {...props}
    />
  );
}

export function TableHead({ className = "", ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={`
        h-11 px-4 text-left align-middle
        font-medium
        text-[12px] uppercase tracking-wider
        text-[color:var(--text-tertiary)]
        ${className}
      `}
      {...props}
    />
  );
}

export function TableCell({ className = "", ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={`p-4 align-middle text-[color:var(--text-primary)] ${className}`}
      {...props}
    />
  );
}
