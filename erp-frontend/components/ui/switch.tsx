"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** An on/off switch (role="switch"); `checked` is controlled by the caller. */
export function Switch({
  checked,
  onCheckedChange,
  className,
  size = "default",
  ...props
}: Omit<ComponentProps<"button">, "onChange" | "type" | "role"> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  size?: "default" | "sm";
}) {
  const small = size === "sm";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        small ? "h-5 w-9" : "h-6 w-11",
        checked ? "bg-primary" : "bg-input",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          "inline-block rounded-full bg-background shadow transition-transform",
          small ? "size-4" : "size-5",
          checked ? (small ? "translate-x-4.5" : "translate-x-5") : "translate-x-0.5",
        )}
      />
    </button>
  );
}
