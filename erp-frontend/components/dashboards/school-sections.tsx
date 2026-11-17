import Link from "next/link";
import { ArrowUpRight, ClipboardCheck, TrendingUp } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { AreaChart, BarChart } from "@/components/ui/charts";
import { SectionHeading } from "@/components/ui/misc";
import { Trend } from "@/components/dashboards/trends";
import { DEMO_TODAY, shiftDate } from "@/lib/mock";
import { getResource } from "@/lib/resources";
import { formatDate } from "@/lib/utils";

// Dashboard sections the reference shows to every role holding the matching
// permission: attendance ("read attendance"), the calendar ("read calendar
// event") and notices ("read notice").

const ATTENDANCE_LAST_7_DAYS = [
  { label: "Thu", rate: 94 },
  { label: "Fri", rate: 91 },
  { label: "Sat", rate: null },
  { label: "Sun", rate: null },
  { label: "Mon", rate: 96 },
  { label: "Tue", rate: 93 },
  { label: "Wed", rate: 95 },
];

const ATTENDANCE_BY_WEEK = [
  { week: "13 Oct", rate: 92 },
  { week: "20 Oct", rate: 89 },
  { week: "27 Oct", rate: 94 },
  { week: "3 Nov", rate: 95 },
];

/** Today's register figures and the last seven days of attendance. */
export function AttendanceToday() {
  const activeStudents = (getResource("students")?.rows ?? []).filter((student) => student.status === "Active").length;

  return (
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
        {ATTENDANCE_LAST_7_DAYS.map((day) => (
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
  );
}

/** Calendar events from today through the next seven days. */
export function NextSevenDays() {
  const upcoming = (getResource("calendar-events")?.rows ?? [])
    .filter((event) => String(event.date) >= DEMO_TODAY && String(event.date) <= shiftDate(DEMO_TODAY, 7))
    .slice(0, 6);

  return (
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
  );
}

/** Weekly attendance rate over the last four weeks. */
export function AttendanceTrend() {
  return (
    <Trend
      id="trend-attendance"
      title="Attendance"
      period="Last 4 weeks"
      value="95%"
      detail=""
      detailNode={
        <span className="inline-flex items-center gap-1 text-sm tabular-nums text-muted-foreground">
          <TrendingUp className="size-4" /> +1 pts
        </span>
      }
    >
      <AreaChart
        data={ATTENDANCE_BY_WEEK}
        xKey="week"
        series={{ key: "rate", label: "Present %", color: "hsl(var(--chart-2))" }}
        label="Weekly attendance rate"
        format={(value) => `${value}%`}
        max={100}
      />
    </Trend>
  );
}

const INCIDENTS_BY_WEEK = [
  { week: "15 Sep", incidents: 3 },
  { week: "22 Sep", incidents: 5 },
  { week: "29 Sep", incidents: 2 },
  { week: "6 Oct", incidents: 4 },
  { week: "13 Oct", incidents: 1 },
  { week: "20 Oct", incidents: 3 },
  { week: "27 Oct", incidents: 2 },
  { week: "3 Nov", incidents: 2 },
];

/** Incidents recorded each week over the last eight weeks ("read incident"). */
export function IncidentsTrend() {
  const thisWeek = INCIDENTS_BY_WEEK[INCIDENTS_BY_WEEK.length - 1].incidents;
  const total = INCIDENTS_BY_WEEK.reduce((sum, week) => sum + week.incidents, 0);

  return (
    <Trend id="trend-incidents" title="Incidents" period="Last 8 weeks" value={String(thisWeek)} detail={`this week · ${total} in 8 weeks`}>
      <BarChart
        data={INCIDENTS_BY_WEEK}
        xKey="week"
        series={[{ key: "incidents", label: "Incidents", color: "hsl(var(--chart-5))" }]}
        label="Incidents per week"
        showLegend={false}
      />
    </Trend>
  );
}

/** Notices running today. */
export function NoticesSection() {
  const notices = (getResource("notices")?.rows ?? []).filter((notice) => notice.status === "Published").slice(0, 5);

  return (
    <section className="min-w-0" aria-labelledby="notices-overview">
      <SectionHeading title="Notices" id="notices-overview">
        <Link href="/notices" className="inline-flex min-h-10 select-none items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          All notices <ArrowUpRight className="size-4" />
        </Link>
      </SectionHeading>
      {notices.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">No current notices.</p>
      ) : (
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
      )}
    </section>
  );
}
