import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/misc";
import { FeesCollectedTrend, MoneyInOutTrend, OwedTrend } from "@/components/dashboards/finance-trends";
import {
  AttendanceToday,
  AttendanceTrend,
  IncidentsTrend,
  NextSevenDays,
  NoticesSection,
} from "@/components/dashboards/school-sections";
import { EnrolmentByClassTrend } from "@/components/dashboards/trends";
import { getResource } from "@/lib/resources";
import { formatNumber } from "@/lib/utils";

const count = (slug: string) => getResource(slug)?.rows.length ?? 0;

/**
 * The whole-school dashboard, as the reference shows it to a school
 * administrator. Roles without their own dashboard see it too.
 *
 * `linkCampuses` is false for someone without organization access: the
 * reference still shows how many campuses there are, but not as a link.
 */
export function SchoolDashboard({ linkCampuses = true }: { linkCampuses?: boolean }) {
  const students = getResource("students")?.rows ?? [];
  const activeStudents = students.filter((student) => student.status === "Active").length;

  const snapshot: { label: string; value: number; href?: string }[] = [
    { label: "Campuses", value: count("schools"), href: linkCampuses ? "/schools" : undefined },
    { label: "Class", value: count("academic-levels"), href: "/academic-levels" },
    { label: "Section", value: count("academic-cycle-sections"), href: "/academic-cycle-sections" },
    { label: "Open term", value: 1, href: "/academic-years" },
    { label: "Subject", value: count("subjects"), href: "/course-offerings" },
    { label: "Active students", value: activeStudents, href: "/students" },
    { label: "Teachers", value: count("teachers"), href: "/teachers" },
    { label: "Parents", value: count("parents"), href: "/parents" },
  ];

  return (
    <div className="space-y-10">
      <section className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-center sm:justify-between" aria-labelledby="school-setup-heading">
        <div className="min-w-0">
          <h2 id="school-setup-heading" className="font-semibold">
            Finish setting up your school
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="h-1.5 w-32 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Setup progress" aria-valuemin={0} aria-valuemax={10} aria-valuenow={8}>
              <span className="block h-full w-4/5 rounded-full bg-foreground/60" />
            </span>
            <span className="tabular-nums">8 of 10</span>
            <span>· 1 required left</span>
            <Link href="/school-settings" className="font-medium text-foreground underline-offset-4 hover:underline">
              All setup steps
            </Link>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm">
            <span className="text-muted-foreground">Next:</span> <span className="font-medium">Publish the exam schedule</span>
          </p>
          <ButtonLink href="/exams">
            Open exams <ArrowRight />
          </ButtonLink>
        </div>
      </section>

      <section aria-label="School snapshot">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4 xl:grid-cols-8">
          {snapshot.map((stat) =>
            stat.href ? (
              <Link key={stat.label} href={stat.href} className="group flex min-h-11 select-none flex-col-reverse justify-end">
                <dt className="truncate text-sm text-muted-foreground group-hover:text-foreground">{stat.label}</dt>
                <dd className="text-2xl font-semibold tabular-nums">{formatNumber(stat.value)}</dd>
              </Link>
            ) : (
              <div key={stat.label} className="flex min-h-11 select-none flex-col-reverse justify-end">
                <dt className="truncate text-sm text-muted-foreground">{stat.label}</dt>
                <dd className="text-2xl font-semibold tabular-nums">{formatNumber(stat.value)}</dd>
              </div>
            ),
          )}
        </dl>
      </section>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <AttendanceToday />
        <NextSevenDays />
      </div>

      <section className="space-y-6" aria-labelledby="trends-overview">
        <SectionHeading title="Trends" id="trends-overview" />
        <div className="grid gap-x-10 gap-y-12 lg:grid-cols-2">
          <AttendanceTrend />
          <FeesCollectedTrend />
          <OwedTrend />
          <MoneyInOutTrend />
          <EnrolmentByClassTrend />
          <IncidentsTrend />
        </div>
      </section>

      <NoticesSection />
    </div>
  );
}
