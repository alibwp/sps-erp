"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  CalendarDays,
  CalendarOff,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Ellipsis,
  FileChartColumn,
  GraduationCap,
  House,
  Receipt,
  ScrollText,
  Send,
  Sparkles,
  Undo2,
} from "lucide-react";
import { useSession } from "@/components/auth/session";
import { ReportDownload } from "@/components/screens/report-download";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Input, Select, Textarea } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { DEMO_TODAY, shiftDate } from "@/lib/mock";
import { PORTAL_AREAS, portalLearner, portalLearnersFor, type PortalAreaId, type PortalLearner } from "@/lib/portal";
import { cn, formatDate, formatMoney } from "@/lib/utils";

/** The learner the signed-in person reads in the portal, or null before sign-in is known. */
export function usePortalLearner(): PortalLearner | null {
  const { ready, role } = useSession();
  const first = portalLearnersFor(role.id)[0];
  return useMemo(() => (ready && first !== undefined ? portalLearner(first) : null), [ready, first]);
}

const shortDate = (iso: string) => formatDate(iso);

/** The page body for one portal area. */
export function PortalAreaView({ area }: { area: PortalAreaId | "notification-preferences" | "overview" }) {
  const learner = usePortalLearner();
  if (!learner) return <div className="h-64 animate-pulse rounded-lg border bg-muted/40" aria-busy="true" />;

  switch (area) {
    case "overview":
      return <Overview learner={learner} />;
    case "results":
      return <Results learner={learner} />;
    case "attendance":
      return <Attendance learner={learner} />;
    case "timetable":
      return <Timetable learner={learner} />;
    case "calendar":
      return <SchoolCalendar learner={learner} />;
    case "notices":
      return <Notices learner={learner} />;
    case "invoices":
      return <Invoices learner={learner} />;
    case "documents":
      return <Documents learner={learner} />;
    case "requests":
      return <Requests learner={learner} />;
    case "library":
      return <LibraryArea learner={learner} />;
    case "boarding":
      return <Boarding learner={learner} />;
    case "graduation":
      return <Graduation learner={learner} />;
    case "programmes":
      return <Programmes learner={learner} />;
    case "syllabi":
      return <Syllabi learner={learner} />;
    case "notification-preferences":
      return <NotificationSettings learner={learner} />;
  }
}

function Panel({ title, description, children, className }: { title?: ReactNode; description?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <Card className={className}>
      {(title || description) && (
        <CardHeader>
          {title && <CardTitle>{title}</CardTitle>}
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
      )}
      {children && <CardContent className={title || description ? undefined : "pt-6"}>{children}</CardContent>}
    </Card>
  );
}

// ----- My school (overview) -------------------------------------------------

function Overview({ learner }: { learner: PortalLearner }) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <p className="text-sm text-muted-foreground">Choose a campus to view the school records and services available to your family.</p>
      <Card>
        <div className="flex flex-col gap-1.5 border-b p-6">
          <h3 className="text-lg font-semibold leading-none tracking-tight">{learner.school}</h3>
          <p className="text-sm text-muted-foreground">1 enrolment</p>
        </div>
        <div className="flex flex-col gap-3 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-medium">{learner.name}</p>
              <p className="text-sm text-muted-foreground">
                {learner.admissionNumber} · {learner.status}
              </p>
            </div>
            <Badge>{learner.school}</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {PORTAL_AREAS.map((area) => (
              <ButtonLink key={area.id} href={area.href} variant="outline" size="sm">
                {area.label}
              </ButtonLink>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

// ----- Results -------------------------------------------------------------

function Results({ learner }: { learner: PortalLearner }) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        The approved result of each course of {learner.name} · {learner.school}. A mark the school is still checking is not shown.
      </p>
      <Panel>
        {learner.results.length === 0 ? (
          <EmptyState icon={GraduationCap} title="No approved results yet" description="Results appear here when the school approves them." />
        ) : (
          <div className="beautify-scrollbar overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th scope="col" className="py-2 pr-3 font-medium">Subject</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Term</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Score</th>
                  <th scope="col" className="py-2 font-medium">Approved</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {learner.results.map((result) => (
                  <tr key={result.subject}>
                    <td className="py-2 pr-3 font-medium">{result.subject}</td>
                    <td className="py-2 pr-3">{result.term}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{result.score}%</td>
                    <td className="whitespace-nowrap py-2">{shortDate(result.approved)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

// ----- Attendance ----------------------------------------------------------

function Attendance({ learner }: { learner: PortalLearner }) {
  const { attendance } = learner;
  const figures = [
    { label: "Present", value: attendance.present, hint: "Days in school" },
    { label: "Absent", value: attendance.absent, hint: "Days missed" },
    { label: "Late", value: attendance.late, hint: "Days of arriving after the start" },
    { label: "Excused", value: attendance.excused, hint: "Absences the school agreed to" },
  ];

  return (
    <Panel
      title={learner.name}
      description="The school counts only the days it took a register. A day with no register does not count as an absence."
    >
      {attendance.recorded === 0 ? (
        <EmptyState icon={CalendarOff} title="No attendance recorded yet" description="Once the school starts taking the register, the days appear here." />
      ) : (
        <div className="space-y-6">
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm text-muted-foreground">Attendance rate</p>
              <p className="text-sm text-muted-foreground">{attendance.recorded} days recorded</p>
            </div>
            <p className="text-4xl font-semibold">{attendance.rate}%</p>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={`Attendance rate ${attendance.rate} percent`}>
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(attendance.rate, 100)}%` }} />
            </div>
          </div>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {figures.map((figure) => (
              <div key={figure.label} className="rounded-lg border p-4">
                <dt className="text-sm text-muted-foreground">{figure.label}</dt>
                <dd className="text-2xl font-semibold">{figure.value}</dd>
                <p className="mt-1 text-xs text-muted-foreground">{figure.hint}</p>
              </div>
            ))}
          </dl>
        </div>
      )}
    </Panel>
  );
}

// ----- Timetable -----------------------------------------------------------

function Timetable({ learner }: { learner: PortalLearner }) {
  const timetables = [...new Set(learner.week.flatMap((day) => day.lessons.map((lesson) => lesson.timetable)))];

  return (
    <div className="flex w-full flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        The week of {learner.name}, with the lessons they take · {learner.school}.
      </p>
      <Panel title="This week" description={timetables.length > 0 ? `From ${timetables.join(" and ")}` : undefined}>
        {learner.week.length === 0 ? (
          <EmptyState icon={Clock} title="No timetable yet" description="The timetable appears here when the school publishes it." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {learner.week.map((day, index) => (
              <section key={day.weekday} className="flex flex-col gap-2" aria-labelledby={`week-day-${index}`}>
                <h3 id={`week-day-${index}`} className="text-sm font-semibold">
                  {day.weekday}
                </h3>
                <ul className="divide-y rounded-md border">
                  {day.lessons.map((lesson) => (
                    <li key={lesson.start} className="flex gap-3 px-3 py-2 text-sm">
                      <span className="w-24 shrink-0 tabular-nums text-muted-foreground">
                        {lesson.start}–{lesson.stop}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-medium">{lesson.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {lesson.teachers.join(", ")} · {lesson.timetable}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

// ----- School calendar -----------------------------------------------------

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function monthKey(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function SchoolCalendar({ learner }: { learner: PortalLearner }) {
  const today = DEMO_TODAY;
  const [view, setView] = useState(() => ({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 }));
  const step = (delta: number) =>
    setView(({ year, month }) => {
      const next = month + delta;
      return { year: year + Math.floor(next / 12), month: ((next % 12) + 12) % 12 };
    });

  const key = monthKey(view.year, view.month);
  const events = learner.calendarEvents.filter((event) => event.date.startsWith(key));
  const closures = events.filter((event) => event.kind === "Holiday");

  // Monday-first grid covering the whole month.
  const first = `${key}-01`;
  const firstWeekday = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(view.year, view.month + 1, 0)).getUTCDate();
  const cells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const days = Array.from({ length: cells }, (_, index) => shiftDate(first, index - firstWeekday));

  const prev = MONTH_NAMES[(view.month + 11) % 12].slice(0, 3);
  const next = MONTH_NAMES[(view.month + 1) % 12].slice(0, 3);

  return (
    <div className="space-y-6">
      <Panel
        title={`${MONTH_NAMES[view.month]} ${view.year}`}
        description={
          closures.length === 0
            ? "The school is open every day this month."
            : `The school is shut on ${closures.map((closure) => formatDate(closure.date).replace(/ \d{4}$/, "")).join(", ")}.`
        }
      >
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => step(-1)}>
                <ChevronLeft /> {prev}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setView({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 })}>
                Today
              </Button>
              <Button variant="outline" size="sm" onClick={() => step(1)}>
                {next} <ChevronRight />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">{learner.name}</p>
          </div>

          <div className="overflow-x-auto">
            <div className="grid min-w-[46rem] grid-cols-7 gap-px rounded-lg border bg-border">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((weekday) => (
                <div key={weekday} className="bg-muted/50 px-2 py-2 text-center text-xs font-medium text-foreground">
                  {weekday}
                </div>
              ))}
              {days.map((day) => (
                <div key={day} className={cn("min-h-24 bg-background p-2", !day.startsWith(key) && "opacity-50")}>
                  <span className={cn("text-xs font-medium", day === today && "rounded-full bg-primary px-1.5 py-0.5 text-primary-foreground")}>
                    {Number(day.slice(8, 10))}
                  </span>
                  <ul className="mt-1 space-y-1">
                    {learner.calendarEvents
                      .filter((event) => event.date === day)
                      .map((event) => (
                        <li
                          key={event.id}
                          title={event.title}
                          className={cn("truncate rounded border px-1.5 py-0.5 text-xs", event.kind === "Holiday" && "bg-muted font-medium")}
                        >
                          {event.title}
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="What is on this month" description="These are the days the school put in front of your family.">
        {events.length === 0 ? (
          <EmptyState icon={CalendarDays} title="Nothing is on this month" description="Step to another month, or check back once the school publishes its calendar." />
        ) : (
          <ul className="divide-y rounded-md border">
            {events.map((event) => (
              <li key={event.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div>
                  <p className="font-medium">{event.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(event.date).replace(/ \d{4}$/, "")} · {event.time === "All day" ? "All day" : event.time}
                    {event.location && ` · ${event.location}`}
                  </p>
                </div>
                <div className="text-right">
                  <Badge className="bg-background">{event.kind}</Badge>
                  {event.kind === "Meeting" && (
                    <ButtonLink
                      href={`/portal/requests?subject=${encodeURIComponent(`Appointment: ${event.title}`)}`}
                      variant="outline"
                      size="sm"
                      className="mt-2 flex"
                    >
                      Request this time
                    </ButtonLink>
                  )}
                  {event.kind === "Holiday" && <span className="mt-1 block text-xs text-muted-foreground">The school is shut</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

// ----- Notices -------------------------------------------------------------

function daysAgo(iso: string): string {
  const days = Math.round((Date.parse(`${DEMO_TODAY}T00:00:00Z`) - Date.parse(`${iso}T00:00:00Z`)) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
}

function Notices({ learner }: { learner: PortalLearner }) {
  if (learner.notices.length === 0) {
    return <Panel title="No notices yet" description="Messages the school sends will appear here." />;
  }

  return (
    <div className="flex flex-col gap-4">
      {learner.notices.map((notice) => (
        <Panel key={notice.id} title={notice.title} description={`Sent ${daysAgo(notice.sent)}`}>
          <div className="flex flex-col gap-3">
            <p className="max-w-none text-sm text-foreground/80">{notice.body}</p>
            {notice.attachment && (
              <div>
                <ReportDownload title="The attachment">
                  <Download /> Download attachment
                </ReportDownload>
              </div>
            )}
          </div>
        </Panel>
      ))}
    </div>
  );
}

// ----- Invoices and payments -----------------------------------------------

function Invoices({ learner }: { learner: PortalLearner }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">{learner.name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{learner.school} · Read-only account statement</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Panel title="Still owed" description="What the school records as due.">
          <p className="text-2xl font-semibold">{formatMoney(learner.balance)}</p>
        </Panel>
        <Panel title="Credit held" description="Money paid that has not been used on an invoice.">
          <p className="text-2xl font-semibold">{formatMoney(learner.credit)}</p>
        </Panel>
      </div>

      <Panel title="Invoices" description="Every invoice recorded for this learner at this school.">
        {learner.invoices.length === 0 ? (
          <EmptyState icon={Receipt} title="No invoices yet" description="The school has not recorded an invoice for this learner." />
        ) : (
          <>
            <div className="grid gap-3 md:hidden">
              {learner.invoices.map((invoice) => (
                <article key={invoice.name} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="min-w-0 break-words font-medium">{invoice.name}</h3>
                    <p className="shrink-0 text-right font-semibold">
                      {formatMoney(invoice.balance)}
                      <span className="block text-xs font-normal text-muted-foreground">Balance</span>
                    </p>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div>
                      <dt className="text-muted-foreground">Issued</dt>
                      <dd className="mt-1">{shortDate(invoice.issued)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Due</dt>
                      <dd className="mt-1">{shortDate(invoice.due)}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-muted-foreground">Total</dt>
                      <dd className="mt-1">{formatMoney(invoice.total)}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b text-muted-foreground">
                  <tr>
                    <th className="p-4 font-medium">Invoice</th>
                    <th className="p-4 font-medium">Issued</th>
                    <th className="p-4 font-medium">Due</th>
                    <th className="p-4 text-right font-medium">Total</th>
                    <th className="p-4 text-right font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {learner.invoices.map((invoice) => (
                    <tr key={invoice.name} className="border-b last:border-0">
                      <td className="p-4 font-medium">{invoice.name}</td>
                      <td className="p-4 text-muted-foreground">{shortDate(invoice.issued)}</td>
                      <td className="p-4 text-muted-foreground">{shortDate(invoice.due)}</td>
                      <td className="p-4 text-right tabular-nums">{formatMoney(invoice.total)}</td>
                      <td className="p-4 text-right tabular-nums">{formatMoney(invoice.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}

// ----- Documents -----------------------------------------------------------

function Documents({ learner }: { learner: PortalLearner }) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Published documents for {learner.name} at {learner.school}.
      </p>

      <Panel title="Report cards" description="Each row is the latest published revision for one academic period.">
        {learner.reportCards.length === 0 ? (
          <EmptyState icon={FileChartColumn} title="No report cards yet" description="The school will publish a report card here when it is ready." />
        ) : (
          <div className="space-y-3">
            {learner.reportCards.map((card) => (
              <div key={card.period} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
                <div>
                  <p className="font-medium">{card.period}</p>
                  <p className="text-sm text-muted-foreground">
                    Revision {card.revision} · published {shortDate(card.published)}
                  </p>
                </div>
                <ReportDownload title={`The report card for ${card.period}`}>
                  <Download /> Download
                </ReportDownload>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Transcript" description="The latest issued lifetime academic record.">
        {learner.transcript === null ? (
          <EmptyState icon={ScrollText} title="No transcript yet" description="The school will issue a transcript when the record is ready." />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
            <div>
              <p className="font-medium">Revision {learner.transcript.revision}</p>
              <p className="text-sm text-muted-foreground">Issued {shortDate(learner.transcript.issued)}</p>
            </div>
            <ReportDownload title={`Transcript revision ${learner.transcript.revision}`}>
              <Download /> Download
            </ReportDownload>
          </div>
        )}
      </Panel>
    </div>
  );
}

// ----- Requests ------------------------------------------------------------

const REQUEST_TYPES = ["Document request", "Correction request", "Appointment request", "Acknowledgement"];

function Requests({ learner }: { learner: PortalLearner }) {
  const toast = useToast();
  const [requests, setRequests] = useState(learner.requests);
  // A link from the calendar can fill in the subject, as in the reference.
  const [subject, setSubject] = useState(() =>
    typeof window === "undefined" ? "" : (new URLSearchParams(window.location.search).get("subject") ?? ""),
  );
  const [type, setType] = useState(() => (subject.startsWith("Appointment:") ? "Appointment request" : REQUEST_TYPES[0]));
  const [message, setMessage] = useState("");

  const send = (event: FormEvent) => {
    event.preventDefault();
    if (!subject.trim()) return;
    setRequests((current) => [
      { id: `new-${current.length + 1}`, subject: subject.trim(), type, sent: DEMO_TODAY, status: "Open", message: message.trim(), response: "", answered: "" },
      ...current,
    ]);
    setSubject("");
    setMessage("");
    toast({ title: "Request sent", description: "The school will read and answer it." });
  };

  const withdraw = (id: string) => {
    setRequests((current) => current.map((request) => (request.id === id ? { ...request, status: "Withdrawn" } : request)));
    toast({ title: "Request taken back" });
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10">
      <section aria-labelledby="ask-heading" className="flex flex-col gap-4">
        <div>
          <h2 id="ask-heading" className="text-base font-semibold">
            Ask the school
          </h2>
          <p className="text-sm text-muted-foreground">Send a message about {learner.name}. The school will read and answer it.</p>
        </div>
        <form onSubmit={send} className="flex flex-col gap-3" aria-label="Ask the school">
          <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
            <div>
              <label htmlFor="request-subject" className="sr-only">
                What you need
              </label>
              <Input
                id="request-subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                maxLength={255}
                required
                placeholder="What you need, e.g. a copy of last term's report"
                className="h-11"
              />
            </div>
            <div>
              <label htmlFor="request-type" className="sr-only">
                Kind of request
              </label>
              <Select id="request-type" value={type} onChange={(event) => setType(event.target.value)} className="h-11">
                {REQUEST_TYPES.map((requestType) => (
                  <option key={requestType}>{requestType}</option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <label htmlFor="request-message" className="sr-only">
              More detail (optional)
            </label>
            <Textarea id="request-message" value={message} onChange={(event) => setMessage(event.target.value)} rows={3} maxLength={2000} placeholder="More detail (optional)" />
          </div>
          <div className="flex sm:justify-end">
            <Button type="submit" className="h-11 w-full select-none sm:w-auto">
              <Send aria-hidden /> Send
            </Button>
          </div>
        </form>
      </section>

      <section aria-labelledby="asked-heading" className="flex flex-col gap-3">
        <h2 id="asked-heading" className="text-base font-semibold">
          What you have asked for
        </h2>
        {requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">You have not asked for anything yet</p>
        ) : (
          <ul className="divide-y border-y">
            {requests.map((request) => (
              <li key={request.id} className="flex flex-col gap-2 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium [overflow-wrap:anywhere]">{request.subject}</p>
                    <p className="text-sm text-muted-foreground">
                      {request.type} · sent {shortDate(request.sent)} · {request.status}
                    </p>
                  </div>
                  {request.status === "Open" && (
                    <DropdownMenu trigger={<Ellipsis className="size-4" />} triggerLabel={`Actions for ${request.subject}`} triggerVariant="ghost" triggerClassName="size-11 shrink-0" className="w-44">
                      <DropdownMenuItem destructive onClick={() => withdraw(request.id)}>
                        <Undo2 /> Take back
                      </DropdownMenuItem>
                    </DropdownMenu>
                  )}
                </div>
                {request.message && <p className="whitespace-pre-line text-sm [overflow-wrap:anywhere]">{request.message}</p>}
                {request.response && (
                  <div className="border-l-2 pl-3">
                    <p className="text-xs text-muted-foreground">The school answered on {shortDate(request.answered)}</p>
                    <p className="mt-1 whitespace-pre-line text-sm [overflow-wrap:anywhere]">{request.response}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ----- Library -------------------------------------------------------------

function LibraryArea({ learner }: { learner: PortalLearner }) {
  return (
    <div className="flex flex-col gap-6">
      <Panel title={learner.name} description={`${learner.school} · Books currently borrowed`}>
        {learner.loans.length === 0 ? (
          <p className="text-sm text-muted-foreground">There are no books on loan.</p>
        ) : (
          <div className="flex flex-col divide-y">
            {learner.loans.map((loan) => (
              <div key={loan.copy} className="flex flex-col gap-1 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{loan.title}</p>
                  <p className="text-sm text-muted-foreground">Copy {loan.copy}</p>
                </div>
                <p className={cn("text-sm", loan.due < DEMO_TODAY ? "text-destructive" : "text-muted-foreground")}>Due {shortDate(loan.due)}</p>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Library queue" description="Titles reserved for this learner.">
        {learner.reservations.length === 0 ? (
          <p className="text-sm text-muted-foreground">There are no active reservations.</p>
        ) : (
          <div className="flex flex-col divide-y">
            {learner.reservations.map((reservation) => (
              <div key={reservation.title} className="flex flex-col gap-1 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{reservation.title}</p>
                  <p className="text-sm text-muted-foreground">{reservation.status}</p>
                </div>
                {reservation.holdsUntil && <p className="text-sm text-muted-foreground">Collect by {shortDate(reservation.holdsUntil)}</p>}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

// ----- Boarding ------------------------------------------------------------

function Boarding({ learner }: { learner: PortalLearner }) {
  const { place, latestRoll } = learner.boarding;
  return (
    <Panel title={learner.name} description={`Current boarding place at ${learner.school}.`}>
      {!place ? (
        <EmptyState icon={House} title="No current boarding place" description="The school has not recorded a current house and bed for this learner." />
      ) : (
        <>
          <div className="flex items-center gap-3 rounded-lg border p-4">
            <span className="flex size-10 items-center justify-center rounded-full bg-muted">
              <House className="size-5" />
            </span>
            <div>
              <p className="font-medium">{place}</p>
              <p className="text-sm text-muted-foreground">House · room · bed</p>
            </div>
          </div>
          {latestRoll && (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border bg-muted/20 p-4">
              <div>
                <p className="text-sm font-medium">Latest boarding check</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {latestRoll.type} · {shortDate(latestRoll.takenOn)}
                </p>
              </div>
              <Badge className="bg-background">{latestRoll.status}</Badge>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

// ----- Graduation progress -------------------------------------------------

const REQUIREMENT_STATES: Record<string, string> = {
  met: "Met",
  exempt: "Excused",
  not_met: "Below pass mark",
  no_result: "No published result",
  not_judged: "Checked outside school results",
};

type Stage = { name: string; complete: boolean; requiredCredits: number | null; stages?: Stage[] };

function StageTree({ stages }: { stages: Stage[] }) {
  return (
    <ul className="space-y-2">
      {stages.map((stage) => (
        <li key={stage.name} className="rounded-md border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">{stage.name}</span>
            <span className="text-sm">{stage.complete ? "Complete" : "In progress"}</span>
          </div>
          {stage.requiredCredits !== null && <p className="mt-1 text-sm text-muted-foreground">Requires {stage.requiredCredits} credits</p>}
          {stage.stages && stage.stages.length > 0 && (
            <div className="mt-3 border-l pl-3">
              <StageTree stages={stage.stages} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function Graduation({ learner }: { learner: PortalLearner }) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        {learner.name} · {learner.school}
      </p>

      {learner.graduation.length === 0 ? (
        <EmptyState icon={GraduationCap} title="No graduation plan applies yet" description="The school has not assigned an active plan to this learner or their group." />
      ) : (
        learner.graduation.map((plan) => (
          <Panel key={plan.name} title={plan.name} description={plan.description}>
            <div className="flex flex-wrap items-center gap-2">
              {plan.complete ? <Badge tone="success">Requirements met</Badge> : <Badge className="bg-background">In progress</Badge>}
              <span className="text-sm text-muted-foreground">{plan.group}</span>
              <span className="text-sm text-muted-foreground">
                {plan.creditsEarned} of {plan.creditsRequired} credits
              </span>
            </div>

            {plan.stages.length > 0 && (
              <section className="mt-5 space-y-3" aria-label="Stage progress">
                <h3 className="text-sm font-semibold">Stages</h3>
                <StageTree stages={plan.stages} />
              </section>
            )}

            {plan.requirements.length > 0 && (
              <section className="mt-5 space-y-3" aria-label="Graduation requirements">
                <h3 className="text-sm font-semibold">Requirements</h3>
                <ul className="divide-y rounded-md border">
                  {plan.requirements.map((requirement) => (
                    <li key={requirement.description} className="flex flex-wrap items-start justify-between gap-2 px-3 py-3">
                      <span className="min-w-0">
                        <span className="block font-medium">{requirement.description}</span>
                        <span className="text-sm text-muted-foreground">
                          {requirement.negated ? "Must not be met" : "Must be met"}
                          {requirement.percentage !== null && ` · ${requirement.percentage.toFixed(2)}%`}
                        </span>
                      </span>
                      <span className="text-sm">{REQUIREMENT_STATES[requirement.state] ?? "Not complete"}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </Panel>
        ))
      )}

      <p className="text-sm text-muted-foreground">Only published results count. Work still in the gradebook is not shown here.</p>
    </div>
  );
}

// ----- Programmes ----------------------------------------------------------

function Programmes({ learner }: { learner: PortalLearner }) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        Clubs and activities recorded for {learner.name} · {learner.school}.
      </p>

      {learner.programmes.length === 0 ? (
        <EmptyState icon={Sparkles} title="No club or activity places yet" description="When the school records a place in a club or activity, it will appear here." />
      ) : (
        learner.programmes.map((programme) => (
          <Panel
            key={programme.name}
            title={
              <span className="flex flex-wrap items-center gap-2">
                <span>{programme.name}</span>
                <Badge className="bg-background">{programme.status}</Badge>
              </span>
            }
            description={programme.type}
          >
            {programme.description && <p className="text-sm">{programme.description}</p>}
            <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              {programme.schedule && (
                <div>
                  <dt className="inline font-medium">Schedule:</dt> <dd className="inline">{programme.schedule}</dd>
                </div>
              )}
              {(programme.starts || programme.ends) && (
                <div>
                  <dt className="inline font-medium">Dates:</dt>{" "}
                  <dd className="inline">
                    {programme.starts ? shortDate(programme.starts) : "Not set"} – {programme.ends ? shortDate(programme.ends) : "Not set"}
                  </dd>
                </div>
              )}
            </dl>
          </Panel>
        ))
      )}
    </div>
  );
}

// ----- Syllabi -------------------------------------------------------------

function Syllabi({ learner }: { learner: PortalLearner }) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        What each course of {learner.name} plans to teach, week by week, and what the class has covered · {learner.school}.
      </p>

      {learner.syllabi.length === 0 ? (
        <Panel>
          <p className="text-sm text-muted-foreground">No syllabus is published yet for these courses.</p>
        </Panel>
      ) : (
        learner.syllabi.map((syllabus) => (
          <Panel key={syllabus.subject} title={syllabus.subject} description={`${syllabus.name} · ${syllabus.period}`}>
            <p className="mb-3 text-sm">
              <span className="font-semibold">
                {syllabus.summary.covered} of {syllabus.summary.total}
              </span>{" "}
              topics covered
              {syllabus.summary.behind > 0 ? ` · ${syllabus.summary.behind} behind the plan` : syllabus.summary.expected > 0 ? " · on track" : ""}
            </p>
            <ol className="divide-y rounded-md border text-sm">
              {syllabus.topics.map((topic) => {
                const thisWeek = topic.week === syllabus.currentWeek;
                return (
                  <li key={topic.title} className={cn("flex flex-wrap items-start justify-between gap-2 p-2", thisWeek && "bg-primary/5")}>
                    <div>
                      <span className="text-muted-foreground">Week {topic.week} ·</span> <span className="font-medium">{topic.title}</span>
                      {thisWeek && <span className="ml-1 text-xs font-medium">This week</span>}
                      {topic.objectives && <span className="block text-muted-foreground">{topic.objectives}</span>}
                    </div>
                    <span className="text-muted-foreground">{topic.status}</span>
                  </li>
                );
              })}
            </ol>
          </Panel>
        ))
      )}
    </div>
  );
}

// ----- Notification settings -----------------------------------------------

function NotificationSettings({ learner }: { learner: PortalLearner }) {
  const [emailOn, setEmailOn] = useState(true);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-8">
        <section className="flex flex-col gap-2" aria-labelledby="notice-email-heading">
          <h2 id="notice-email-heading" className="text-base font-semibold">
            Email me a copy of notices
          </h2>
          <ul className="divide-y border-y">
            <li>
              <label htmlFor="notice-email-school" className="flex min-h-11 cursor-pointer select-none items-center justify-between gap-4 py-3">
                <span className="min-w-0">
                  <span className={cn("block font-medium", !emailOn && "text-muted-foreground")}>{learner.school}</span>
                  <span className="block text-sm text-muted-foreground">{emailOn ? "Emails arrive, and notices stay here too" : "Notices only here"}</span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  id="notice-email-school"
                  checked={emailOn}
                  onChange={(event) => setEmailOn(event.target.checked)}
                  className={cn(
                    "relative h-6 w-10 shrink-0 cursor-pointer appearance-none rounded-full transition-colors before:absolute before:left-0.5 before:top-0.5 before:size-5 before:rounded-full before:bg-background before:shadow before:transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    emailOn ? "bg-foreground before:translate-x-4" : "bg-input",
                  )}
                />
              </label>
            </li>
          </ul>
        </section>
        <p className="text-sm text-muted-foreground">
          Account and safety messages, such as a password reset, are always sent. You cannot turn those off here.
        </p>
      </div>
    </div>
  );
}
