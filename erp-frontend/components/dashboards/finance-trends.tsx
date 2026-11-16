import { BarChart } from "@/components/ui/charts";
import { CASH_BY_MONTH, FEES_BY_MONTH, OWED_BY_LATENESS } from "@/components/dashboards/finance-data";
import { Trend } from "@/components/dashboards/trends";
import { formatMoney } from "@/lib/utils";

// The money trends the reference shows to anyone who reads fee invoices
// (fees, owed) and also expenses (money in and out).

/** Fees billed against collected over the last six months. */
export function FeesCollectedTrend() {
  const billed = FEES_BY_MONTH.reduce((sum, month) => sum + month.billed, 0);
  const collected = FEES_BY_MONTH.reduce((sum, month) => sum + month.collected, 0);

  return (
    <Trend id="trend-fees" title="Fees collected" period="Last 6 months" value={formatMoney(collected)} detail={`of ${formatMoney(billed)} billed`}>
      <BarChart
        data={FEES_BY_MONTH}
        xKey="month"
        series={[
          { key: "billed", label: "Billed", color: "hsl(var(--muted-foreground) / 0.45)" },
          { key: "collected", label: "Collected", color: "hsl(var(--chart-2))" },
        ]}
        label="Fees billed and collected by month"
        format={formatMoney}
      />
    </Trend>
  );
}

/** What families owe, by how late it is. */
export function OwedTrend() {
  const owedTotal = OWED_BY_LATENESS.reduce((sum, bucket) => sum + bucket.owed, 0);
  const lateTotal = owedTotal - OWED_BY_LATENESS[0].owed;
  const largest = Math.max(1, ...OWED_BY_LATENESS.map((bucket) => bucket.owed));

  return (
    <Trend id="trend-owed" title="Owed" period="By how late" value={formatMoney(owedTotal)} detail={`${formatMoney(lateTotal)} late`}>
      <ul className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 text-sm">
        {OWED_BY_LATENESS.map((bucket, index) => (
          <li key={bucket.label} className="contents">
            <span className="truncate">{bucket.label}</span>
            <span className="relative h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
              <span
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${(bucket.owed / largest) * 100}%`,
                  backgroundColor: index === 0 ? "hsl(var(--muted-foreground) / 0.4)" : "hsl(var(--chart-5))",
                }}
              />
            </span>
            <span className={bucket.owed === 0 ? "text-right tabular-nums text-muted-foreground" : "text-right tabular-nums"}>
              {bucket.owed === 0 ? "—" : formatMoney(bucket.owed)}
            </span>
          </li>
        ))}
      </ul>
    </Trend>
  );
}

/** Money received against money spent, by month. */
export function MoneyInOutTrend() {
  const cashIn = CASH_BY_MONTH.reduce((sum, month) => sum + month.received, 0);
  const cashOut = CASH_BY_MONTH.reduce((sum, month) => sum + month.spent, 0);
  const net = cashIn - cashOut;

  return (
    <Trend
      id="trend-cash"
      title="Money in and out"
      period="Last 6 months"
      value={`${net < 0 ? "−" : ""}${formatMoney(Math.abs(net))}`}
      valueClassName={net < 0 ? "text-destructive" : undefined}
      detail={`${formatMoney(cashIn)} in · ${formatMoney(cashOut)} out`}
    >
      <BarChart
        data={CASH_BY_MONTH}
        xKey="month"
        series={[
          { key: "received", label: "In", color: "hsl(var(--chart-2))" },
          { key: "spent", label: "Out", color: "hsl(var(--chart-5))" },
        ]}
        label="Money received and spent by month"
        format={formatMoney}
      />
    </Trend>
  );
}
