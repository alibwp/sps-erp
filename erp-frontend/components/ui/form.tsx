import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const controlClasses =
  "h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive";

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("text-sm font-medium leading-none", className)} {...props} />;
}

export function Input({ className, type = "text", ...props }: ComponentProps<"input">) {
  if (type === "file") {
    return (
      <input
        type="file"
        className={cn(
          "block w-full text-sm text-muted-foreground file:mr-3 file:h-11 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:text-sm file:font-medium file:text-foreground hover:file:bg-accent",
          className,
        )}
        {...props}
      />
    );
  }
  return <input type={type} className={cn(controlClasses, className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select className={cn(controlClasses, "pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(controlClasses, "h-auto min-h-28 py-2", className)} {...props} />;
}

/** A labelled control, the way the reference lays out every form field. */
export function Field({
  label,
  htmlFor,
  help,
  error,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  help?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("grid gap-2", className)}>
      <label htmlFor={htmlFor} className="text-sm text-muted-foreground">
        {label}
      </label>
      {children}
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
