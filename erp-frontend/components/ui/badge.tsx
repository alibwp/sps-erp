import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "solid";

const tones: Record<Tone, string> = {
  neutral: "border-border bg-muted/60 text-foreground",
  success: "border-success/25 bg-success/10 text-success",
  warning: "border-warning/25 bg-warning/10 text-warning",
  danger: "border-destructive/25 bg-destructive/10 text-destructive",
  info: "border-chart-3/25 bg-chart-3/10 text-foreground",
  solid: "border-transparent bg-primary text-primary-foreground",
};

export function Badge({ tone = "neutral", className, ...props }: ComponentProps<"span"> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

const SUCCESS = /^(active|paid|approved|published|present|completed|available|current|resolved|returned|graduated|accepted|on track|ready to collect|a\+?|built in)$/i;
const WARNING = /^(pending|draft|partially paid|waiting|submitted|in review|interview|offered|investigating|in progress|late|scheduled|invited|on leave|setting up|near limit|under review|needs review|away|under maintenance|medium|b|open)$/i;
const DANGER = /^(overdue|rejected|cancelled|absent|suspended|left|expired|declined|over budget|high|f|unpaid|d)$/i;

export function toneFor(value: string): Tone {
  if (SUCCESS.test(value)) return "success";
  if (WARNING.test(value)) return "warning";
  if (DANGER.test(value)) return "danger";
  return "neutral";
}

/** A badge that picks its color from common status words. */
export function StatusBadge({ value, className }: { value: string; className?: string }) {
  return (
    <Badge tone={toneFor(value)} className={className}>
      {value}
    </Badge>
  );
}
