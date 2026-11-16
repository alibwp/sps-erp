import type { ReactNode } from "react";
import { SampleBadge } from "@/components/ui/demo";

// The layout of one dashboard trend. Live trends are in
// components/dashboards/live.tsx; trends whose backend does not exist yet
// pass `sample` and say so.

/** One trend: its title and period, the headline figure, then a chart or list. */
export function Trend({
  id,
  title,
  period,
  value,
  valueClassName,
  detail,
  detailNode,
  sample = false,
  children,
}: {
  id: string;
  title: string;
  period: string;
  value: string;
  valueClassName?: string;
  detail: string;
  /** Shown instead of `detail` when the detail needs more than text. */
  detailNode?: ReactNode;
  /** The figures are sample data: the backend for them does not exist yet. */
  sample?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0" id={id}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          {title}
          {sample && <SampleBadge />}
        </h3>
        <p className="text-sm text-muted-foreground">{period}</p>
      </div>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-3">
        <span className={`text-3xl font-semibold tabular-nums ${valueClassName ?? ""}`}>{value}</span>
        {detailNode ?? <span className="text-sm tabular-nums text-muted-foreground">{detail}</span>}
      </p>
      <div className="mt-4">{children}</div>
    </div>
  );
}
