import * as React from "react";
import { cn } from "../../lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-[var(--accent)] text-black shadow-[0_12px_24px_rgba(0,0,0,0.16)] hover:brightness-105",
        variant === "secondary" && "border border-[var(--border)] bg-[var(--panel-soft)] text-[var(--text)] hover:bg-[var(--accent-soft)]",
        variant === "ghost" && "bg-transparent text-[var(--text-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--text)]",
        variant === "danger" && "bg-[var(--danger)] text-white hover:brightness-95",
        className,
      )}
      {...props}
    />
  );
}
