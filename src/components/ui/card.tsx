import * as React from "react";
import { cn } from "../../lib/utils";

/**
 * A styled container component with a frosted glass effect.
 */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {

  return (
    <div
      className={cn(
        "rounded-[32px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_92%,transparent)] shadow-panel backdrop-blur-2xl",
        className,
      )}
      {...props}
    />
  );
}
