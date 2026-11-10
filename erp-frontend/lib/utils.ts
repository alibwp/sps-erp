type ClassValue = string | number | false | null | undefined;

/** Join class names, skipping falsy values. */
export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(" ");
}

/** First letters of the first two words, for avatar fallbacks. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** Format an ISO date (YYYY-MM-DD) as "5 Nov 2026". */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? iso : dateFormatter.format(date);
}

const moneyFormatter = new Intl.NumberFormat("en-PK", {
  maximumFractionDigits: 0,
});

/** Format an amount in Pakistani rupees, e.g. "Rs 12,500". */
export function formatMoney(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  return `Rs ${moneyFormatter.format(amount)}`;
}

export function formatNumber(value: number): string {
  return moneyFormatter.format(value);
}

/** Title-case a slug or key: "fee-invoices" → "Fee invoices". */
export function humanize(value: string): string {
  const spaced = value.replace(/[-_]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
