import { StatusBadge } from "@/components/ui/badge";
import { Avatar, Progress } from "@/components/ui/misc";
import type { Column, Row } from "@/lib/resources";
import { formatDate, formatMoney, formatNumber } from "@/lib/utils";

/** Render one table or detail value according to its column kind. */
export function Cell({ column, row }: { column: Column; row: Row }) {
  const value = row[column.key];
  if (value === null || value === undefined || value === "") return <span className="text-muted-foreground">—</span>;

  switch (column.kind) {
    case "person":
      return (
        <span className="flex min-w-0 items-center gap-3">
          <Avatar name={String(value)} size="sm" />
          <span className="min-w-0">
            <span className="block truncate font-medium">{value}</span>
            {column.sub && row[column.sub] !== undefined && (
              <span className="block truncate text-xs text-muted-foreground">{row[column.sub]}</span>
            )}
          </span>
        </span>
      );
    case "badge":
      return <StatusBadge value={String(value)} />;
    case "money":
      return <span className="tabular-nums">{formatMoney(Number(value))}</span>;
    case "date":
      return <span className="whitespace-nowrap tabular-nums">{formatDate(String(value))}</span>;
    case "number":
      return <span className="tabular-nums">{typeof value === "number" ? formatNumber(value) : value}</span>;
    case "mono":
      return <span className="font-mono text-xs">{value}</span>;
    case "percent":
      return (
        <span className="flex min-w-28 items-center gap-2">
          <Progress value={Number(value)} className="w-16" />
          <span className="tabular-nums">{value}%</span>
        </span>
      );
    default:
      return <span>{value}</span>;
  }
}

/** Plain text of a value, for search and sorting. */
export function cellText(column: Column, row: Row): string {
  const value = row[column.key];
  if (value === null || value === undefined) return "";
  if (column.kind === "money") return formatMoney(Number(value));
  if (column.kind === "date") return formatDate(String(value));
  return String(value);
}
