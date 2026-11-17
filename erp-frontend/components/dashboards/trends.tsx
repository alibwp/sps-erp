import Link from "next/link";
import type { ReactNode } from "react";
import { SCHOOL } from "@/lib/mock";
import { getResource } from "@/lib/resources";
import { formatNumber } from "@/lib/utils";

// Dashboard parts shared by the role dashboards that show the reference's
// "School snapshot" and "Trends" sections.

/** Seats per section, used to show how full each class is. */
const SEATS_PER_SECTION = 45;

/** The snapshot row when the only school figure a role may read is students. */
export function ActiveStudentsSnapshot() {
  const students = getResource("students")?.rows ?? [];
  const activeStudents = students.filter((student) => student.status === "Active").length;

  return (
    <section aria-label="School snapshot">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4 xl:grid-cols-7">
        <Link href="/students" className="group flex min-h-11 select-none flex-col-reverse justify-end">
          <dt className="truncate text-sm text-muted-foreground group-hover:text-foreground">Active students</dt>
          <dd className="text-2xl font-semibold tabular-nums">{formatNumber(activeStudents)}</dd>
        </Link>
      </dl>
    </section>
  );
}

/** One trend: its title and period, the headline figure, then a chart or list. */
export function Trend({
  id,
  title,
  period,
  value,
  valueClassName,
  detail,
  detailNode,
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
  children: ReactNode;
}) {
  return (
    <div className="min-w-0" id={id}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-sm font-medium">{title}</h3>
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

/** Students in each class against its seats; a class over capacity shows red. */
export function EnrolmentByClassTrend() {
  const classes = (getResource("academic-levels")?.rows ?? []).map((level) => ({
    name: String(level.name),
    students: Number(level.students),
    capacity: Number(level.sections) * SEATS_PER_SECTION,
  }));
  const enrolled = classes.reduce((sum, level) => sum + level.students, 0);
  const seats = classes.reduce((sum, level) => sum + level.capacity, 0);
  const widest = Math.max(1, ...classes.map((level) => Math.max(level.students, level.capacity)));

  return (
    <Trend
      id="trend-enrolment"
      title="Enrolment by class"
      period={SCHOOL.academicYear}
      value={formatNumber(enrolled)}
      detail={seats > 0 ? `of ${formatNumber(seats)} seats` : "students"}
    >
      <ul className="space-y-3">
        {classes.map((level) => {
          const over = level.capacity > 0 && level.students > level.capacity;
          return (
            <li key={level.name} className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm">
              <span className="truncate">{level.name}</span>
              <span className="relative h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                {level.capacity > 0 && (
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-muted-foreground/20"
                    style={{ width: `${(level.capacity / widest) * 100}%` }}
                  />
                )}
                <span
                  className={over ? "absolute inset-y-0 left-0 rounded-full bg-destructive" : "absolute inset-y-0 left-0 rounded-full"}
                  style={{
                    width: `${(level.students / widest) * 100}%`,
                    backgroundColor: over ? undefined : "hsl(var(--chart-2))",
                  }}
                />
              </span>
              <span className="tabular-nums text-muted-foreground">
                {level.students}
                {level.capacity > 0 && <span className="text-muted-foreground/70"> / {level.capacity}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </Trend>
  );
}
