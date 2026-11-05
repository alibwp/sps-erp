"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DEMO_TODAY } from "@/lib/mock";
import { getResource } from "@/lib/resources";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const monthFormatter = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

const KIND_STYLES: Record<string, string> = {
  Holiday: "bg-destructive/10 text-destructive",
  Exam: "bg-warning/10 text-warning",
  Meeting: "bg-chart-3/15",
  Event: "bg-success/10 text-success",
};

/** A month grid of school calendar events. */
export function CalendarMonth() {
  const events = getResource("calendar-events")?.rows ?? [];
  const [month, setMonth] = useState(() => {
    const [year, monthIndex] = DEMO_TODAY.split("-").map(Number);
    return { year, month: monthIndex - 1 };
  });

  const first = new Date(Date.UTC(month.year, month.month, 1));
  const daysInMonth = new Date(Date.UTC(month.year, month.month + 1, 0)).getUTCDate();
  const leading = (first.getUTCDay() + 6) % 7;
  const cells = Array.from({ length: Math.ceil((leading + daysInMonth) / 7) * 7 }, (_, index) => {
    const day = index - leading + 1;
    return day >= 1 && day <= daysInMonth ? day : null;
  });

  const shift = (delta: number) =>
    setMonth((current) => {
      const next = new Date(Date.UTC(current.year, current.month + delta, 1));
      return { year: next.getUTCFullYear(), month: next.getUTCMonth() };
    });

  const iso = (day: number) =>
    `${month.year}-${String(month.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  return (
    <section aria-labelledby="month-heading" className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
        <h2 id="month-heading" className="font-semibold">
          {monthFormatter.format(first)}
        </h2>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" onClick={() => shift(-1)} aria-label="Previous month">
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="icon-sm" onClick={() => shift(1)} aria-label="Next month">
            <ChevronRight />
          </Button>
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border">
        <div className="grid grid-cols-7 bg-muted/50 text-xs font-medium text-muted-foreground">
          {WEEKDAYS.map((weekday) => (
            <div key={weekday} className="px-2 py-2">
              {weekday}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, index) => {
            const dayEvents = day ? events.filter((event) => event.date === iso(day)) : [];
            const today = day !== null && iso(day) === DEMO_TODAY;
            return (
              <div
                key={index}
                className={cn("min-h-20 border-t p-1.5 sm:min-h-24", index % 7 !== 0 && "border-l", !day && "bg-muted/20")}
              >
                {day && (
                  <>
                    <span
                      className={cn(
                        "inline-flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                        today && "bg-primary font-semibold text-primary-foreground",
                      )}
                    >
                      {day}
                    </span>
                    <ul className="mt-1 grid gap-1">
                      {dayEvents.map((event) => (
                        <li key={event.id}>
                          <Link
                            href={`/calendar-events/${event.id}`}
                            title={String(event.title)}
                            className={cn(
                              "block truncate rounded px-1.5 py-0.5 text-[11px] font-medium hover:opacity-80",
                              KIND_STYLES[String(event.kind)] ?? "bg-muted",
                            )}
                          >
                            {event.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
