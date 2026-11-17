"use client";

import { useMemo } from "react";
import { useWorkingContext } from "@/components/auth/session";
import { withQuery, type Paginated } from "@/lib/api";
import { academicApi, levelTree, type Level, type Section, type Subject, type Year, type YearDetail } from "@/lib/academic";
import { useApiQuery } from "@/lib/use-api";

// The reference lists screens pick from (years, terms, classes, sections,
// subjects, teachers), each read once per screen at the working campus.

/** The campus's school years (up to 100, newest first). */
export function useYears() {
  const { schoolId } = useWorkingContext();
  const query = useApiQuery<Paginated<Year>>(schoolId ? `${academicApi.years}?perPage=100` : null, { keepPrevious: true });
  return { query, years: query.data?.data ?? [] };
}

/** One year with its terms; null skips the call. */
export function useYearDetail(yearId: string | null) {
  const query = useApiQuery<YearDetail>(yearId ? academicApi.year(yearId) : null, { keepPrevious: true });
  return { query, year: query.data?.id === yearId ? query.data : undefined };
}

/** Every class; `teachable` leaves out groups and keeps active classes. */
export function useLevels() {
  const { schoolId } = useWorkingContext();
  const query = useApiQuery<Level[]>(schoolId ? academicApi.levels : null, { keepPrevious: true });
  const levels = useMemo(() => query.data ?? [], [query.data]);
  const name = useMemo(() => new Map(levels.map((level) => [level.id, level.name])), [levels]);
  const teachable = useMemo(
    () => levelTree(levels).filter(({ level }) => !level.isGroup && level.status === "active").map(({ level }) => level),
    [levels],
  );
  return { query, levels, teachable, name };
}

/** Sections of a year (and optionally one class); null year skips the call. */
export function useSections(yearId: string | null, levelId?: string, status?: "active") {
  const query = useApiQuery<Paginated<Section>>(
    yearId ? withQuery(academicApi.sections, { academicYearId: yearId, academicLevelId: levelId, status, perPage: 100 }) : null,
    { keepPrevious: true },
  );
  const sections = useMemo(() => query.data?.data ?? [], [query.data]);
  const name = useMemo(() => new Map(sections.map((section) => [section.id, section.name])), [sections]);
  return { query, sections, name };
}

/** The campus's subjects (up to 100). */
export function useSubjects() {
  const { schoolId } = useWorkingContext();
  const query = useApiQuery<Paginated<Subject>>(schoolId ? `${academicApi.subjects}?perPage=100` : null, { keepPrevious: true });
  return { query, subjects: query.data?.data ?? [] };
}

type Account = { id: string; name: string; email: string; roles: Array<{ name: string }> };

/**
 * The campus's teachers. Listing accounts needs "manage account access";
 * without it `allowed` is false and the screen explains why it cannot offer
 * a teacher.
 */
export function useTeachers() {
  const { can } = useWorkingContext();
  const allowed = can("manage account access");
  const query = useApiQuery<Paginated<Account>>(allowed ? "/v1/accounts?perPage=100" : null);
  const teachers = useMemo(
    () => (query.data?.data ?? []).filter((account) => account.roles.some((role) => role.name === "teacher")),
    [query.data],
  );
  return { allowed, query, teachers };
}
