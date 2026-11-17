"use client";

import { CalendarClock } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { SCHOOL } from "@/lib/mock";

/** The compact academic-period switcher shown under the header. */
export function PeriodBar() {
  const toast = useToast();

  return (
    <div data-print-hide className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b bg-muted/30 px-4 py-2 text-xs text-muted-foreground md:px-8">
      <span className="inline-flex items-center gap-1.5">
        <CalendarClock className="size-3.5" aria-hidden />
        Academic year <span className="font-medium text-foreground">{SCHOOL.academicYear}</span>
      </span>
      <label className="inline-flex items-center gap-1.5">
        Working term
        <select
          defaultValue={SCHOOL.term}
          onChange={(event) => toast({ title: "Working term changed", description: `${event.target.value} is now your working term.` })}
          className="h-7 rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option>First Term</option>
          <option>Second Term</option>
          <option>Third Term</option>
        </select>
      </label>
    </div>
  );
}
