import Link from "next/link";
import { ChevronRight, House, Inbox, type LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn, initials } from "@/lib/utils";

export function Avatar({ name, size = "md", className }: { name: string; size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  const sizes = { sm: "size-8 text-xs", md: "size-9 text-xs", lg: "size-12 text-sm", xl: "size-20 text-xl" };
  // A stable hue per name keeps avatars distinguishable without photos.
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full border font-semibold", sizes[size], className)}
      style={{ backgroundColor: `hsl(${hue} 45% 50% / 0.14)`, color: `hsl(${hue} 45% 38%)` }}
    >
      <span className="dark:brightness-[1.8]">{initials(name)}</span>
    </span>
  );
}

export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <House className="size-3.5" aria-hidden />
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="inline-flex items-center gap-2">
            {item.href && index < items.length - 1 ? (
              <Link className="transition-colors hover:text-foreground" href={item.href}>
                {item.label}
              </Link>
            ) : (
              <span className="font-medium text-foreground" aria-current="page">
                {item.label}
              </span>
            )}
            {index < items.length - 1 && <ChevronRight className="size-3.5" aria-hidden />}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  children,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-6 py-12 text-center", className)}>
      <span className="rounded-full border bg-muted/40 p-3 text-muted-foreground">
        <Icon className="size-6" aria-hidden />
      </span>
      <p className="text-base font-medium">{title}</p>
      {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
      {children && <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{children}</div>}
    </div>
  );
}

type AlertTone = "default" | "destructive" | "warning" | "success";

export function Alert({
  tone = "default",
  icon: Icon,
  title,
  className,
  children,
}: {
  tone?: AlertTone;
  icon?: LucideIcon;
  title?: string;
  className?: string;
  children?: ReactNode;
}) {
  const tones: Record<AlertTone, string> = {
    default: "bg-background",
    destructive: "border-destructive/40 bg-destructive/5 text-destructive",
    warning: "border-warning/40 bg-warning/5",
    success: "border-success/40 bg-success/5",
  };
  return (
    <div role="status" className={cn("flex gap-3 rounded-lg border px-4 py-3 text-sm", tones[tone], className)}>
      {Icon && <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />}
      <div className="grid gap-1">
        {title && <p className="font-medium leading-none tracking-tight">{title}</p>}
        {children && <div className="text-muted-foreground">{children}</div>}
      </div>
    </div>
  );
}

/** A heading row with a bottom border, used to open each dashboard section. */
export function SectionHeading({
  title,
  id,
  children,
}: {
  title: string;
  id?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-10 flex-wrap items-center justify-between gap-2 border-b pb-2">
      <h2 id={id} className="font-semibold">
        {title}
      </h2>
      {children}
    </div>
  );
}

export function Separator({ className, ...props }: ComponentProps<"hr">) {
  return <hr className={cn("border-t", className)} {...props} />;
}

export function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return <kbd className={cn("rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground", className)} {...props} />;
}

export function Progress({ value, className, label }: { value: number; className?: string; label?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <span
      className={cn("block h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
    >
      <span className="block h-full rounded-full bg-foreground/60" style={{ width: `${clamped}%` }} />
    </span>
  );
}
