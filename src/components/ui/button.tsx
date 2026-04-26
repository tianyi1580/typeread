import * as React from "react";
import { cn } from "../../lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}

export function Button({ className, type = "button", variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-[var(--accent)] text-black shadow-[0_14px_40px_var(--shadow)] hover:brightness-105",
        variant === "secondary" && "border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel-soft)_82%,transparent)] text-[var(--text)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]",
        variant === "ghost" && "bg-transparent text-[var(--text-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--text)]",
        variant === "danger" && "bg-[var(--danger)] text-white shadow-[0_14px_40px_color-mix(in_srgb,var(--danger)_35%,transparent)] hover:brightness-95",
        className,
      )}
      {...props}
    />
  );
}
