"use client";

import { CalendarClock, CircleAlert } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import {
  setWorkingPeriod,
  useWorkingContext,
  type AcademicPeriod,
  type AcademicYear,
} from "@/components/auth/session";
import type { Paginated } from "@/lib/api";
import { messageOf, useApiQuery } from "@/lib/use-api";

type YearDetail = AcademicYear & { periods: AcademicPeriod[] };

const selectClasses =
  "h-7 max-w-48 rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

/**
 * The working year and term at the working campus, under the header. Someone
 * allowed to ("set academic year" / "set academic period") can switch them;
 * everyone else sees them as text. The choice is saved on the backend, so
 * every page then answers for the new term.
 */
export function PeriodBar() {
  const toast = useToast();
  const { ready, schoolId, working, can } = useWorkingContext();
  const [saving, setSaving] = useState(false);

  const year = working?.academicYear ?? null;
  const period = working?.academicPeriod ?? null;
  const canSetYear = can("set academic year");
  const canSetPeriod = can("set academic period");

  // Draft years cannot be worked in, so they are not offered.
  const years = useApiQuery<Paginated<AcademicYear>>(
    ready && schoolId && canSetYear ? "/v1/academic-years?perPage=100" : null,
  );
  const yearOptions = (years.data?.data ?? []).filter((item) => item.status !== "draft");
  // The terms to choose from are the top-level periods of the working year.
  const detail = useApiQuery<YearDetail>(ready && schoolId && canSetPeriod && year ? `/v1/academic-years/${year.id}` : null);
  const periodOptions = detail.data?.id === year?.id ? (detail.data?.periods ?? []) : [];

  if (!ready || !schoolId) return null;

  async function save(input: { academicYearId: string } | { academicPeriodId: string }, what: string) {
    setSaving(true);
    try {
      const next = await setWorkingPeriod(input);
      const label = "academicYearId" in input ? next?.academicYear?.name : next?.academicPeriod?.displayName;
      toast({ title: `Working ${what} changed`, description: label ? `${label} is now your working ${what}.` : undefined });
    } catch (error) {
      toast({ title: `Could not change the working ${what}`, description: messageOf(error), tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  const showYearPicker = canSetYear && year !== null && yearOptions.some((item) => item.id === year.id) && yearOptions.length > 1;
  const showPeriodPicker = canSetPeriod && period !== null && periodOptions.some((item) => item.id === period.id);

  return (
    <div
      data-print-hide
      className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b bg-muted/30 px-4 py-2 text-xs text-muted-foreground md:px-8"
      aria-busy={saving}
    >
      <label className="inline-flex items-center gap-1.5">
        <CalendarClock className="size-3.5" aria-hidden />
        Academic year
        {showYearPicker ? (
          <select
            value={year.id}
            disabled={saving}
            onChange={(event) => void save({ academicYearId: event.target.value }, "year")}
            className={selectClasses}
          >
            {yearOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="font-medium text-foreground">{year?.name ?? "Not set"}</span>
        )}
      </label>

      <label className="inline-flex items-center gap-1.5">
        Working term
        {showPeriodPicker ? (
          <select
            value={period.id}
            disabled={saving}
            onChange={(event) => void save({ academicPeriodId: event.target.value }, "term")}
            className={selectClasses}
          >
            {periodOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.displayName}
                {item.status === "closed" || item.status === "archived" ? " (closed)" : ""}
              </option>
            ))}
          </select>
        ) : (
          <span className="font-medium text-foreground">{period?.displayName ?? "Not set"}</span>
        )}
      </label>

      {working?.periodError && (
        <span className="inline-flex items-center gap-1.5 text-destructive" role="status">
          <CircleAlert className="size-3.5" aria-hidden />
          {working.periodError}
        </span>
      )}
    </div>
  );
}
