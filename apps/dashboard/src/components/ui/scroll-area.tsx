import * as React from "react";

export const ScrollArea = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className = "", ...props }, ref) => (
    <div ref={ref} className={`overflow-auto ${className}`} {...props} />
  )
);
ScrollArea.displayName = "ScrollArea";
