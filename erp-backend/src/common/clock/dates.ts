// Calendar days as "YYYY-MM-DD" strings (PostgreSQL `date` columns). Two
// such strings compare correctly as text.

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

function parts(day: string): [number, number, number] {
  const match = DAY.exec(day);
  if (!match) throw new Error(`Not a calendar day: ${day}`);
  return [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
}

function format(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isCalendarDay(value: unknown): value is string {
  if (typeof value !== 'string' || !DAY.test(value)) return false;
  const [year, month, day] = parts(value);
  const date = new Date(Date.UTC(year, month, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month &&
    date.getUTCDate() === day
  );
}

export function addDays(day: string, days: number): string {
  const [year, month, date] = parts(day);
  return format(new Date(Date.UTC(year, month, date + days)));
}

// Moves a day by whole years. 29 February in a year without one becomes
// 1 March, as the reference's Carbon::addYears does.
export function addYears(day: string, years: number): string {
  const [year, month, date] = parts(day);
  return format(new Date(Date.UTC(year + years, month, date)));
}

// "Nov 10, 2026", like Carbon's toFormattedDateString.
export function formatDay(day: string): string {
  const [year, month, date] = parts(day);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month, date)));
}
