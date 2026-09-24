import * as React from "react";

export const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className = "", ...props }, ref) => (
    <label
      ref={ref}
      className={`
        text-[13px] font-medium leading-none
        text-[color:var(--text-secondary)]
        select-none
        ${className}
      `}
      {...props}
    />
  )
);
Label.displayName = "Label";
