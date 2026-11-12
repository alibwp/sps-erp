"use client";

import { useSyncExternalStore } from "react";

const formatter = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

const noop = () => () => {};

/** Today's date, rendered in the browser so prerendered pages stay current. */
export function SchoolToday() {
  const today = useSyncExternalStore(noop, () => formatter.format(new Date()), () => "");
  return <span className="min-h-5 text-sm text-muted-foreground">{today}</span>;
}
