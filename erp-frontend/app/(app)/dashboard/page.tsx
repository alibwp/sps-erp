import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, ClipboardCheck, TrendingDown, TrendingUp } from "lucide-react";
import { Page } from "@/components/layout/page-header";
import { ButtonLink } from "@/components/ui/button";
import { AreaChart, BarChart, DonutChart } from "@/components/ui/charts";
import { SectionHeading } from "@/components/ui/misc";
import { DEMO_TODAY, shiftDate } from "@/lib/mock";
import { getResource } from "@/lib/resources";
import { formatDate, formatMoney, formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

const count = (slug: string) => getResource(slug)?.rows.length ?? 0;

export default function DashboardPage() {
  const students = getResource("students")?.rows ?? [];
  const activeStudents = students.filter((student) => student.status === "Active").length;

  const snapshot = [
    { label: "Campuses", value: count("schools"), href: "/schools" },
    { label: "Class", value: count("academic-levels"), href: "/academic-levels" },
    { label: "Section", value: count("academic-cycle-sections"), href: "/academic-cycle-sections" },
    { label: "Open term", value: 1, href: "/academic-years" },
    { label: "Subject", value: count("subjects"), href: "/course-offerings" },
    { label: "Active students", value: activeStudents, href: "/students" },
    { label: "Teachers", value: count("teachers"), href: "/teachers" },
    { label: "Parents", value: count("parents"), href: "/parents" },
  ];

  const attendanceTrend = [
    { label: "Thu", rate: 94 },
    { label: "Fri", rate: 91 },
    { label: "Sat", rate: null },
    { label: "Sun", rate: null },
    { label: "Mon", rate: 96 },
    { label: "Tue", rate: 93 },
    { label: "Wed", rate: 95 },
  ];

  const upcoming = (getResource("calendar-events")?.rows ?? [])
    .filter((event) => String(event.date) >= DEMO_TODAY && String(event.date) <= shiftDate(DEMO_TODAY, 7))
    .slice(0, 6);

  const notices = (getResource("notices")?.rows ?? []).filter((notice) => notice.status === "Published").slice(0, 5);

  const weeklyAttendance = [
    { week: "13 Oct", rate: 92 },
    { week: "20 Oct", rate: 89 },
    { week: "27 Oct", rate: 94 },
    { week: "3 Nov", rate: 95 },
  ];

  const fees = [
    { month: "Jun", billed: 4200000, collected: 3600000 },
    { month: "Jul", billed: 4150000, collected: 3900000 },
    { month: "Aug", billed: 4300000, collected: 4050000 },
    { month: "Sep", billed: 4380000, collected: 3820000 },
    { month: "Oct", billed: 4400000, collected: 4100000 },
    { month: "Nov", billed: 4420000, collected: 2650000 },
  ];
  const billed = fees.reduce((sum, month) => sum + month.billed, 0);
  const collected = fees.reduce((sum, month) => sum + month.collected, 0);

  const owed = [
    { label: "Not yet due", owed: 1240000 },
    { label: "1–30 days late", owed: 610000 },
    { label: "31–60 days late", owed: 285000 },
    { label: "Over 60 days", owed: 120000 },
  ];
  const owedTotal = owed.reduce((sum, bucket) => sum + bucket.owed, 0);
  const largest = Math.max(...owed.map((bucket) => bucket.owed));

  const cases = (getResource("incidents")?.rows ?? []).filter((incident) => incident.status !== "Closed").length;

  return (
    <Page title="Dashboard" breadcrumbs={[]}>
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
            {snapshot.map((stat) => (
              <Link key={stat.label} href={stat.href} className="group flex min-h-11 select-none flex-col-reverse justify-end">
                <dt className="truncate text-sm text-muted-foreground group-hover:text-foreground">{stat.label}</dt>
                <dd className="text-2xl font-semibold tabular-nums">{formatNumber(stat.value)}</dd>
              </Link>
            ))}
          </dl>
        </section>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <section className="min-w-0" aria-labelledby="today-overview">
            <SectionHeading title="Attendance today" id="today-overview">
              <ButtonLink href="/attendance" variant="outline" size="sm">
                <ClipboardCheck /> Take attendance
              </ButtonLink>
            </SectionHeading>
            <dl className="grid grid-cols-3 gap-4 py-4">
              <div className="flex flex-col-reverse">
                <dt className="text-sm text-muted-foreground">Present</dt>
                <dd className="text-2xl font-semibold tabular-nums">95%</dd>
              </div>
              <div className="flex flex-col-reverse">
                <dt className="text-sm text-muted-foreground">Registered</dt>
                <dd className="text-2xl font-semibold tabular-nums">
                  {activeStudents - 4}
                  <span className="text-sm font-normal text-muted-foreground"> / {activeStudents}</span>
                </dd>
              </div>
              <div className="flex flex-col-reverse">
                <dt className="text-sm text-muted-foreground">Absent · late</dt>
                <dd className="text-2xl font-semibold tabular-nums">
                  2<span className="text-muted-foreground"> · </span>3
                </dd>
              </div>
            </dl>
            <div className="flex h-28 items-end gap-2" aria-label="Attendance rate over the last seven days" role="img">
              {attendanceTrend.map((day) => (
                <div key={day.label} className="flex min-w-0 flex-1 flex-col items-center gap-1.5" title={`${day.label}: ${day.rate === null ? "no register" : `${day.rate}%`}`}>
                  <div className="flex h-20 w-full items-end">
                    <div
                      className={day.rate === null ? "h-1 w-full rounded-t bg-muted" : "w-full rounded-t bg-foreground/50"}
                      style={day.rate === null ? undefined : { height: `${Math.max(8, day.rate)}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">{day.label}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="min-w-0" aria-labelledby="upcoming-overview">
            <SectionHeading title="Next 7 days" id="upcoming-overview">
              <Link href="/calendar-events" className="inline-flex min-h-10 select-none items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                Calendar <ArrowUpRight className="size-4" />
              </Link>
            </SectionHeading>
            {upcoming.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">Nothing scheduled.</p>
            ) : (
              <ul className="divide-y">
                {upcoming.map((event) => (
                  <li key={event.id}>
                    <Link href={`/calendar-events/${event.id}`} className="grid min-h-11 grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-3 py-2 hover:bg-muted/40">
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {String(event.date) === DEMO_TODAY ? "Today" : formatDate(String(event.date)).replace(/ \d{4}$/, "")}
                        <br />
                        {event.time}
                      </span>
                      <span className="min-w-0">
                        <span className="block break-words text-sm font-medium">{event.title}</span>
                        <span className="block text-xs text-muted-foreground">
                          {event.kind} · {event.audience}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="space-y-6" aria-labelledby="trends-overview">
          <SectionHeading title="Trends" id="trends-overview" />
          <div className="grid gap-x-10 gap-y-12 lg:grid-cols-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h3 className="text-sm font-medium">Attendance</h3>
                <p className="text-sm text-muted-foreground">Last 4 weeks</p>
              </div>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-3">
                <span className="text-3xl font-semibold tabular-nums">95%</span>
                <span className="inline-flex items-center gap-1 text-sm tabular-nums text-muted-foreground">
                  <TrendingUp className="size-4" /> +1 pts
                </span>
              </p>
              <div className="mt-4">
                <AreaChart
                  data={weeklyAttendance}
                  xKey="week"
                  series={{ key: "rate", label: "Present %", color: "hsl(var(--chart-2))" }}
                  label="Weekly attendance rate"
                  format={(value) => `${value}%`}
                  max={100}
                />
              </div>
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h3 className="text-sm font-medium">Fees collected</h3>
                <p className="text-sm text-muted-foreground">Last 6 months</p>
              </div>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-3">
                <span className="text-3xl font-semibold tabular-nums">{formatMoney(collected)}</span>
                <span className="text-sm tabular-nums text-muted-foreground">of {formatMoney(billed)} billed</span>
              </p>
              <div className="mt-4">
                <BarChart
                  data={fees}
                  xKey="month"
                  series={[
                    { key: "billed", label: "Billed", color: "hsl(var(--muted-foreground) / 0.45)" },
                    { key: "collected", label: "Collected", color: "hsl(var(--chart-2))" },
                  ]}
                  label="Fees billed and collected by month"
                  format={formatMoney}
                  height={168}
                />
              </div>
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h3 className="text-sm font-medium">Owed</h3>
                <p className="text-sm text-muted-foreground">By how late</p>
              </div>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-3">
                <span className="text-3xl font-semibold tabular-nums">{formatMoney(owedTotal)}</span>
                <span className="text-sm tabular-nums text-muted-foreground">{formatMoney(owedTotal - owed[0].owed)} late</span>
              </p>
              <ul className="mt-4 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 text-sm">
                {owed.map((bucket, index) => (
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
                    <span className="tabular-nums text-muted-foreground">{formatMoney(bucket.owed)}</span>
                  </li>
                ))}
              </ul>
              <Link href="/fee-invoices" className="mt-4 inline-flex min-h-10 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                Fee invoices <ArrowUpRight className="size-4" />
              </Link>
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h3 className="text-sm font-medium">Enrolment</h3>
                <p className="text-sm text-muted-foreground">This year</p>
              </div>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-3">
                <span className="text-3xl font-semibold tabular-nums">{students.length}</span>
                <span className="inline-flex items-center gap-1 text-sm tabular-nums text-muted-foreground">
                  <TrendingDown className="size-4" /> {cases} open cases
                </span>
              </p>
              <div className="mt-4">
                <DonutChart
                  label="Learners by stage"
                  centerValue={String(students.length)}
                  centerLabel="learners"
                  segments={[
                    { label: "Primary", value: 18, color: "hsl(var(--chart-2))" },
                    { label: "Middle", value: 16, color: "hsl(var(--chart-1))" },
                    { label: "Secondary", value: 10, color: "hsl(var(--chart-4))" },
                    { label: "Early years", value: 4, color: "hsl(var(--chart-3))" },
                  ]}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="min-w-0" aria-labelledby="notices-overview">
          <SectionHeading title="Notices" id="notices-overview">
            <Link href="/notices" className="inline-flex min-h-10 select-none items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              All notices <ArrowUpRight className="size-4" />
            </Link>
          </SectionHeading>
          <ul className="divide-y">
            {notices.map((notice) => (
              <li key={notice.id}>
                <Link href={`/notices/${notice.id}`} className="flex min-h-11 items-center justify-between gap-4 py-2 hover:bg-muted/40">
                  <span className="min-w-0 break-words text-sm font-medium">{notice.title}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">Until {formatDate(String(notice.ends))}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Page>
  );
}
