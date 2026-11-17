"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useMemo } from "react";
import { useWorkingContext } from "@/components/auth/session";
import { useAllAccounts } from "@/components/people/accounts";
import { STEP_LINKS, type SchoolSetup } from "@/components/screens/school-settings";
import { Trend } from "@/components/dashboards/trends";
import { ButtonLink } from "@/components/ui/button";
import { withQuery, type Paginated } from "@/lib/api";
import { academicApi, levelTree, type Level, type Section } from "@/lib/academic";
import { ROLE_NAMES } from "@/lib/people";
import { teachingApi } from "@/lib/teaching";
import { useApiQueries, useApiQuery } from "@/lib/use-api";
import { formatNumber } from "@/lib/utils";

// The dashboard figures that come from the backend. Each one is only asked
// for, and only shown, when the person holds the permission it needs.

type Tile = { label: string; value: string | null; href?: string };

/** Shown for a figure the backend could not give. */
const UNAVAILABLE = "—";

/** The total of a paged list, asked for with one row per page. */
function useTotal(path: string | null) {
  const query = useApiQuery<Paginated<unknown>>(path ? withQuery(path, { perPage: 1 }) : null, { keepPrevious: true });
  // A failed count shows a dash, not a skeleton that never ends.
  if (query.error) return UNAVAILABLE;
  return query.data ? formatNumber(query.data.meta.total) : null;
}

function Tiles({ tiles, label }: { tiles: Tile[]; label: string }) {
  if (tiles.length === 0) return null;
  return (
    <section aria-label={label}>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4 xl:grid-cols-8">
        {tiles.map((tile) => {
          const body = (
            <>
              <dt className="truncate text-sm text-muted-foreground group-hover:text-foreground">{tile.label}</dt>
              <dd className="truncate text-2xl font-semibold tabular-nums">
                {tile.value ?? <span className="inline-block h-7 w-12 animate-pulse rounded bg-muted align-middle" aria-label="Loading" />}
              </dd>
            </>
          );
          return tile.href ? (
            <Link key={tile.label} href={tile.href} className="group flex min-h-11 select-none flex-col-reverse justify-end">
              {body}
            </Link>
          ) : (
            <div key={tile.label} className="flex min-h-11 select-none flex-col-reverse justify-end">
              {body}
            </div>
          );
        })}
      </dl>
    </section>
  );
}

/** The whole-school figures: campuses, classes, sections, term, subjects, learners and people. */
export function SchoolSnapshot({ linkCampuses = true }: { linkCampuses?: boolean }) {
  const { schoolId, campuses, working, can } = useWorkingContext();
  const yearId = working?.academicYear?.id;
  const levels = useApiQuery<Level[]>(schoolId && can("read class") ? `${academicApi.levels}?status=active` : null, { keepPrevious: true });
  const sections = useTotal(
    schoolId && yearId && can("read section") ? withQuery(academicApi.sections, { academicYearId: yearId, status: "active" }) : null,
  );
  const subjects = useTotal(schoolId && can("read subject") ? academicApi.subjects : null);
  const students = useTotal(schoolId && can("read student") ? withQuery(teachingApi.students, { status: "active" }) : null);
  const people = useAllAccounts();
  const countRole = (role: string) => {
    if (people.error) return UNAVAILABLE;
    if (!people.data) return null;
    return formatNumber(people.data.filter((account) => account.roles.some((held) => held.name === role)).length);
  };

  const tiles: Tile[] = [
    { label: "Campuses", value: formatNumber(campuses.length), href: linkCampuses ? "/schools" : undefined },
  ];
  if (can("read class"))
    tiles.push({
      label: "Classes",
      value: levels.error ? UNAVAILABLE : levels.data ? formatNumber(levels.data.filter((level) => !level.isGroup).length) : null,
      href: "/academic-levels",
    });
  if (can("read section") && yearId) tiles.push({ label: "Sections", value: sections, href: "/academic-cycle-sections" });
  tiles.push({ label: "Working term", value: working?.academicPeriod?.displayName ?? "Not set", href: "/academic-years" });
  if (can("read subject")) tiles.push({ label: "Subjects", value: subjects, href: "/subjects" });
  if (can("read student")) tiles.push({ label: "Active students", value: students, href: "/students" });
  if (can("manage account access")) {
    tiles.push({ label: "Teachers", value: countRole(ROLE_NAMES.teacher), href: "/teachers" });
    tiles.push({ label: "Parents", value: countRole(ROLE_NAMES.parent), href: "/parents" });
  }
  return <Tiles tiles={tiles} label="School snapshot" />;
}

/** Only the number of active learners, for roles that read nothing else of the school. */
export function ActiveStudentsSnapshot() {
  const { schoolId, can } = useWorkingContext();
  const students = useTotal(schoolId && can("read student") ? withQuery(teachingApi.students, { status: "active" }) : null);
  if (!can("read student")) return null;
  return <Tiles tiles={[{ label: "Active students", value: students, href: "/students" }]} label="School snapshot" />;
}

/** The campus setup progress, for the people who may change the school (GET /v1/school/setup). */
export function SetupBanner() {
  const { schoolId, can } = useWorkingContext();
  const allowed = can("update school") || can("manage school settings");
  const setup = useApiQuery<SchoolSetup>(schoolId && allowed ? "/v1/school/setup" : null, { keepPrevious: true });
  const data = setup.data;
  // Nothing to say once the setup is confirmed, or when it cannot be read.
  if (!data || data.phase.status === "acknowledged") return null;

  const next = data.items.find((item) => item.key === data.next);
  const link = next ? STEP_LINKS[next.key] : undefined;
  const href = link?.startsWith("#") ? `/school-settings${link}` : link;
  const percent = data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0;

  return (
    <section className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-center sm:justify-between" aria-labelledby="school-setup-heading">
      <div className="min-w-0">
        <h2 id="school-setup-heading" className="font-semibold">
          {data.phase.status === "ready" ? "Your school is ready: confirm the setup" : "Finish setting up your school"}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span
            className="h-1.5 w-32 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label="Setup progress"
            aria-valuemin={0}
            aria-valuemax={data.total}
            aria-valuenow={data.completed}
          >
            <span className="block h-full rounded-full bg-foreground/60" style={{ width: `${percent}%` }} />
          </span>
          <span className="tabular-nums">
            {data.completed} of {data.total}
          </span>
          {data.requiredRemaining > 0 && <span>· {data.requiredRemaining} required left</span>}
          <Link href="/school-settings#setup" className="font-medium text-foreground underline-offset-4 hover:underline">
            All setup steps
          </Link>
        </div>
      </div>
      {next && href && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm">
            <span className="text-muted-foreground">Next:</span> <span className="font-medium">{next.title}</span>
          </p>
          <ButtonLink href={href}>
            Open <ArrowRight />
          </ButtonLink>
        </div>
      )}
      {!next && data.phase.status === "ready" && (
        <ButtonLink href="/school-settings#setup">
          Confirm setup <ArrowRight />
        </ButtonLink>
      )}
    </section>
  );
}

/**
 * Active learners in each class of the working year against the seats of its
 * active sections (sections without a capacity add no seats). One count per
 * class; a class over its seats shows red.
 */
export function EnrolmentByClassTrend() {
  const { schoolId, working, can } = useWorkingContext();
  const yearId = working?.academicYear?.id ?? null;
  const allowed = Boolean(schoolId && yearId) && can("read student") && can("read class");

  const levels = useApiQuery<Level[]>(allowed ? `${academicApi.levels}?status=active` : null, { keepPrevious: true });
  const classes = useMemo(
    () => levelTree(levels.data ?? []).filter(({ level }) => !level.isGroup).map(({ level }) => level),
    [levels.data],
  );
  const sections = useApiQuery<Paginated<Section>>(
    allowed && can("read section") ? withQuery(academicApi.sections, { academicYearId: yearId, status: "active", perPage: 100 }) : null,
    { keepPrevious: true },
  );
  const counts = useApiQueries<Paginated<unknown>>(
    allowed && levels.data
      ? classes.map((level) =>
          withQuery(teachingApi.students, { status: "active", academicYearId: yearId, academicLevelId: level.id, perPage: 1 }),
        )
      : null,
  );

  if (!allowed) return null;

  const rows = classes.map((level, index) => ({
    name: level.name,
    students: counts.data?.[index]?.meta.total ?? 0,
    capacity: (sections.data?.data ?? [])
      .filter((section) => section.academicLevelId === level.id)
      .reduce((sum, section) => sum + (section.capacity ?? 0), 0),
  }));
  const enrolled = rows.reduce((sum, row) => sum + row.students, 0);
  const seats = rows.reduce((sum, row) => sum + row.capacity, 0);
  const widest = Math.max(1, ...rows.map((row) => Math.max(row.students, row.capacity)));
  const loading = !counts.data && !counts.error;

  return (
    <Trend
      id="trend-enrolment"
      title="Enrolment by class"
      period={working?.academicYear?.name ?? ""}
      value={loading ? "…" : formatNumber(enrolled)}
      detail={seats > 0 ? `of ${formatNumber(seats)} seats` : "active students"}
    >
      {counts.error ? (
        <p className="text-sm text-destructive">{counts.error.message}</p>
      ) : rows.length === 0 && !levels.loading ? (
        <p className="text-sm text-muted-foreground">No active classes yet.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => {
            const over = row.capacity > 0 && row.students > row.capacity;
            return (
              <li key={row.name} className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm">
                <span className="truncate">{row.name}</span>
                <span className="relative h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                  {row.capacity > 0 && (
                    <span className="absolute inset-y-0 left-0 rounded-full bg-muted-foreground/20" style={{ width: `${(row.capacity / widest) * 100}%` }} />
                  )}
                  <span
                    className={over ? "absolute inset-y-0 left-0 rounded-full bg-destructive" : "absolute inset-y-0 left-0 rounded-full"}
                    style={{ width: `${(row.students / widest) * 100}%`, ...(over ? {} : { backgroundColor: "hsl(var(--chart-2))" }) }}
                  />
                </span>
                <span className={over ? "tabular-nums text-destructive" : "tabular-nums text-muted-foreground"}>
                  {loading ? "…" : row.capacity > 0 ? `${row.students} / ${row.capacity}` : row.students}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Trend>
  );
}
