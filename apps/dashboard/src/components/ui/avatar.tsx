import * as React from "react";

export function Avatar({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full bg-gray-200 ${className}`} {...props} />;
}
export function AvatarImage({ className = "", ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
  return <img className={`aspect-square h-full w-full object-cover ${className}`} {...props} />;
}
export function AvatarFallback({ className = "", children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`flex h-full w-full items-center justify-center rounded-full bg-gray-300 text-sm font-medium text-gray-600 ${className}`} {...props}>
      {children}
    </div>
  );
}
