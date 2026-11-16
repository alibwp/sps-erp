"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookMarked, Layers, Plus, ShieldAlert } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useWorkingContext } from "@/components/auth/session";
import { useLevels, useSections, useSubjects, useYearDetail, useYears } from "@/components/academic/lookups";
import { StatusBadge } from "@/components/academic/status-dialogs";
import { RosterPicker, rosterBody, rosterProblem, type RosterValue } from "@/components/teaching/roster-picker";
import { Page } from "@/components/layout/page-header";
import { FormError, Loaded, LookupError } from "@/components/ui/api-states";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert, EmptyState } from "@/components/ui/misc";
import { Pagination, Table, TD, TH, THead, TR } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { withQuery, type Paginated } from "@/lib/api";
import {
  academicApi,
  rosterModeLabel,
  STRUCTURE_STATUS_LABELS,
  type InstructionalModelState,
  type RosterMode,
  type StructureStatus,
} from "@/lib/academic";
import { ALL_PERIODS, sectionRule, teachingApi, type BulkResult, type Offering } from "@/lib/teaching";
import { useApiMutation, useApiQuery, type ApiQuery } from "@/lib/use-api";

const PER_PAGE = 20;

/** "Offer a subject" and "Offer to several classes", for "create subject". */
export function OfferingActions() {
  const { can } = useWorkingContext();
  if (!can("create subject")) return null;
  return (
    <>
      <ButtonLink href="/course-offerings/bulk" variant="outline">
        <Layers /> Offer to several classes
      </ButtonLink>
      <ButtonLink href="/course-offerings/create">
        <Plus /> Offer a subject
      </ButtonLink>
    </>
  );
}

/** How an offering's roster reads in a list: "Sections A, B" or "The whole class level". */
export function rosterSummary(offering: Offering, sectionName: Map<string, string>): string {
  if (sectionRule(offering.rosterMode)) {
    const names = offering.academicCycleSectionIds.map((id) => sectionName.get(id) ?? "?");
    return names.length > 0 ? `${names.length === 1 ? "Section" : "Sections"} ${names.join(", ")}` : rosterModeLabel(offering.rosterMode);
  }
  if (offering.rosterMode === "individual_roster") return `${offering.studentRecordIds.length} named learners`;
  return rosterModeLabel(offering.rosterMode);
}

/** /course-offerings: subjects being taught, by year, term, class, subject and status. */
export function OfferingList() {
  const { working } = useWorkingContext();
  const [yearId, setYearId] = useState<string | null>(null);
  const [periodId, setPeriodId] = useState("");
  const [levelId, setLevelId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [status, setStatus] = useState<StructureStatus | "">("");
  const [page, setPage] = useState(1);

  const year = yearId ?? working?.academicYear?.id ?? "";
  const { query: yearsQuery, years } = useYears();
  const { query: detailQuery, year: detail } = useYearDetail(year || null);
  const levels = useLevels();
  const { query: subjectsQuery, subjects } = useSubjects();
  const { query: sectionsQuery, name: sectionName } = useSections(year || null);
  const periodName = useMemo(
    () => new Map((detail?.periods ?? []).map((period) => [period.id, period.displayName])),
    [detail],
  );

  const offerings = useApiQuery<Paginated<Offering>>(
    withQuery(teachingApi.offerings, {
      page,
      perPage: PER_PAGE,
      academicYearId: year,
      academicPeriodId: periodId,
      academicLevelId: levelId,
      subjectId,
      status,
    }),
    { keepPrevious: true },
  );

  const filter = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    setPage(1);
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <label className="flex items-center gap-2">
          Year
          <Select
            className="h-9 w-36"
            value={year}
            onChange={(event) => {
              filter(setYearId)(event.target.value);
              setPeriodId("");
            }}
          >
            <option value="">Every year</option>
            {years.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </label>
        {year && (
          <label className="flex items-center gap-2">
            Term
            <Select className="h-9 w-40" value={periodId} onChange={(event) => filter(setPeriodId)(event.target.value)}>
              <option value="">Every term</option>
              {detail?.periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.displayName}
                </option>
              ))}
            </Select>
          </label>
        )}
        <label className="flex items-center gap-2">
          Class
          <Select className="h-9 w-40" value={levelId} onChange={(event) => filter(setLevelId)(event.target.value)}>
            <option value="">Every class</option>
            {levels.teachable.map((level) => (
              <option key={level.id} value={level.id}>
                {level.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex items-center gap-2">
          Subject
          <Select className="h-9 w-44" value={subjectId} onChange={(event) => filter(setSubjectId)(event.target.value)}>
            <option value="">Every subject</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex items-center gap-2">
          Status
          <Select className="h-9 w-36" value={status} onChange={(event) => filter(setStatus)(event.target.value as StructureStatus | "")}>
            <option value="">Every status</option>
            {(Object.keys(STRUCTURE_STATUS_LABELS) as StructureStatus[]).map((value) => (
              <option key={value} value={value}>
                {STRUCTURE_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <LookupError queries={[yearsQuery, detailQuery, levels.query, subjectsQuery, sectionsQuery]} />

      <Loaded query={offerings}>
        {({ data, meta }) =>
          data.length === 0 ? (
            <EmptyState
              icon={BookMarked}
              title="No subjects being taught"
              description="An offering is one subject taught to one class for a term, with its roster and teachers."
            />
          ) : (
            <>
              <Table busy={offerings.loading}>
                <THead>
                  <TH>Subject</TH>
                  <TH>Class</TH>
                  <TH>Term</TH>
                  <TH>Roster</TH>
                  <TH className="text-right">Periods / week</TH>
                  <TH>Status</TH>
                </THead>
                <tbody>
                  {data.map((offering) => (
                    <TR key={offering.id}>
                      <TD>
                        <Link href={`/course-offerings/${offering.id}`} className="font-medium hover:underline hover:underline-offset-4">
                          {offering.subject.name}
                        </Link>
                        {offering.name && <span className="block text-xs text-muted-foreground">{offering.name}</span>}
                      </TD>
                      <TD>{levels.name.get(offering.academicLevelId) ?? "—"}</TD>
                      <TD>{periodName.get(offering.academicPeriodId) ?? "—"}</TD>
                      <TD>{rosterSummary(offering, sectionName)}</TD>
                      <TD className="text-right tabular-nums">{offering.plannedPeriodsPerWeek ?? "—"}</TD>
                      <TD>
                        <StatusBadge status={offering.status} />
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
              <Pagination page={meta.page} perPage={meta.perPage} total={meta.total} onPage={setPage} />
            </>
          )
        }
      </Loaded>
    </div>
  );
}

// ---------------------------------------------------------------- Shared form pieces

/** The roster modes the year's teaching model accepts without an exception. */
function useAllowedModes(yearId: string): RosterMode[] | undefined {
  const model = useApiQuery<InstructionalModelState>(yearId ? `${academicApi.year(yearId)}/instructional-model` : null);
  return model.data?.rosterModes;
}

function NotAllowed() {
  return (
    <Alert tone="warning" icon={ShieldAlert} title="You cannot offer subjects">
      Offering a subject needs the “create subject” permission.
    </Alert>
  );
}

/** Year, term ("Every term" or one), subject: the head of both create forms. */
function OfferingHead({
  yearId,
  setYearId,
  periodId,
  setPeriodId,
  errors,
  lookups = [],
}: {
  yearId: string;
  setYearId: (id: string) => void;
  periodId: string;
  setPeriodId: (id: string) => void;
  errors: Record<string, string>;
  /** Other lists the form reads, so their failures show here too. */
  lookups?: ReadonlyArray<ApiQuery<unknown>>;
}) {
  const { query: yearsQuery, years } = useYears();
  const { query: subjectsQuery, subjects } = useSubjects();
  const { query: yearQuery, year } = useYearDetail(yearId || null);
  // Offerings belong to years that are not closed.
  const usable = years.filter((item) => item.status !== "closed" && item.status !== "archived");

  return (
    <>
      <LookupError queries={[yearsQuery, subjectsQuery, yearQuery, ...lookups]} className="col-span-full" />
      <Field label="Subject" htmlFor="offering-subject" error={errors.subjectId}>
        <Select id="offering-subject" name="subjectId" required defaultValue="">
          <option value="" disabled>
            Choose a subject
          </option>
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name} ({subject.shortName})
            </option>
          ))}
        </Select>
      </Field>
      <Field label="School year" htmlFor="offering-year" error={errors.academicYearId}>
        <Select
          id="offering-year"
          value={yearId}
          onChange={(event) => {
            setYearId(event.target.value);
            setPeriodId(ALL_PERIODS);
          }}
          required
        >
          <option value="" disabled>
            Choose a year
          </option>
          {usable.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Term"
        htmlFor="offering-period"
        error={errors.academicPeriodId}
        help={periodId === ALL_PERIODS ? "One offering per term of the year." : undefined}
      >
        <Select id="offering-period" value={periodId} onChange={(event) => setPeriodId(event.target.value)} disabled={!year}>
          <option value={ALL_PERIODS}>Every term</option>
          {year?.periods.map((period) => (
            <option key={period.id} value={period.id}>
              {period.displayName}
            </option>
          ))}
        </Select>
      </Field>
    </>
  );
}

// ---------------------------------------------------------------- Create one

/** /course-offerings/create: POST /v1/course-offerings (drafts). */
export function CreateOffering() {
  const router = useRouter();
  const toast = useToast();
  const { ready, can, working } = useWorkingContext();
  const save = useApiMutation();
  const levels = useLevels();
  const [yearId, setYearId] = useState(working?.academicYear?.id ?? "");
  const [periodId, setPeriodId] = useState(ALL_PERIODS);
  const [levelId, setLevelId] = useState("");
  const [roster, setRoster] = useState<RosterValue>({ mode: "home_section", sectionIds: [], studentIds: [] });
  const [problem, setProblem] = useState<string | null>(null);
  const allowedModes = useAllowedModes(yearId);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const issue = rosterProblem(roster);
    setProblem(issue);
    if (issue) return;
    const form = new FormData(event.currentTarget);
    const number = (name: string) => (String(form.get(name) ?? "").trim() ? Number(form.get(name)) : null);
    const sent = await save.send<Offering[]>(teachingApi.offerings, {
      method: "POST",
      body: {
        subjectId: String(form.get("subjectId")),
        academicYearId: yearId,
        academicPeriodId: periodId,
        academicLevelId: levelId,
        ...rosterBody(roster),
        plannedPeriodsPerWeek: number("plannedPeriodsPerWeek"),
        capacity: number("capacity"),
        name: String(form.get("name") ?? "").trim() || null,
      },
    });
    if (!sent.ok) return;
    const count = sent.data.length;
    toast({
      title: count === 1 ? "Subject offered" : `${count} offerings created`,
      description: "They start as drafts: activate them once the roster and teachers are set.",
    });
    router.push(count === 1 ? `/course-offerings/${sent.data[0].id}` : "/course-offerings");
  }

  const errors = save.fieldErrors;

  return (
    <Page title="Offer a subject" breadcrumbs={[{ label: "Subjects being taught", href: "/course-offerings" }, { label: "Offer a subject" }]}>
      {ready && !can("create subject") ? (
        <NotAllowed />
      ) : (
        <form onSubmit={submit} onChange={save.clear} className="grid max-w-3xl gap-6">
          <fieldset disabled={save.submitting} className="grid gap-5 sm:grid-cols-2">
            <legend className="sr-only">Offering</legend>
            <OfferingHead yearId={yearId} setYearId={setYearId} periodId={periodId} setPeriodId={setPeriodId} errors={errors} lookups={[levels.query]} />
            <Field label="Class" htmlFor="offering-level" error={errors.academicLevelId}>
              <Select
                id="offering-level"
                value={levelId}
                onChange={(event) => {
                  setLevelId(event.target.value);
                  setRoster((current) => ({ ...current, sectionIds: [], studentIds: [] }));
                }}
                required
              >
                <option value="" disabled>
                  Choose a class
                </option>
                {levels.teachable.map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <RosterPicker yearId={yearId} levelId={levelId} value={roster} onChange={setRoster} allowedModes={allowedModes} errors={errors} />
            </div>
            <Field label="Periods per week" htmlFor="offering-ppw" error={errors.plannedPeriodsPerWeek}>
              <Input id="offering-ppw" name="plannedPeriodsPerWeek" type="number" min={1} max={80} />
            </Field>
            <Field label="Capacity" htmlFor="offering-capacity" error={errors.capacity} help="Most learners it takes. Optional.">
              <Input id="offering-capacity" name="capacity" type="number" min={1} max={5000} />
            </Field>
            <Field
              label="Name of its own"
              htmlFor="offering-name"
              error={errors.name}
              help="Tells two offerings of one subject apart, e.g. “Algebra A”. Optional."
              className="sm:col-span-2"
            >
              <Input id="offering-name" name="name" maxLength={100} />
            </Field>
          </fieldset>
          {problem && <Alert tone="destructive">{problem}</Alert>}
          <FormError
            error={save.error}
            fields={["subjectId", "academicYearId", "academicPeriodId", "academicLevelId", "rosterMode", "academicCycleSectionIds", "studentRecordIds", "plannedPeriodsPerWeek", "capacity", "name"]}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={save.submitting}>
              {save.submitting ? "Saving…" : "Offer subject"}
            </Button>
            <ButtonLink href="/course-offerings" variant="outline">
              Cancel
            </ButtonLink>
          </div>
        </form>
      )}
    </Page>
  );
}

// ---------------------------------------------------------------- Create several

type BulkRow = {
  include: boolean;
  mode: RosterMode;
  sectionIds: string[];
  periods: string;
  capacity: string;
};

/**
 * /course-offerings/bulk: POST /v1/course-offerings/bulk. One subject to
 * several classes at once; with "One section" and several sections ticked,
 * each section gets its own offering. What the year already teaches is
 * skipped and listed.
 */
export function BulkOfferings() {
  const toast = useToast();
  const { ready, can, working } = useWorkingContext();
  const save = useApiMutation();
  const levels = useLevels();
  const [yearId, setYearId] = useState(working?.academicYear?.id ?? "");
  const [periodId, setPeriodId] = useState(ALL_PERIODS);
  const [rows, setRows] = useState<Record<string, BulkRow>>({});
  const [result, setResult] = useState<BulkResult | null>(null);
  const { query: sectionsQuery, sections } = useSections(yearId || null);
  const { year } = useYearDetail(yearId || null);
  const periodName = new Map((year?.periods ?? []).map((period) => [period.id, period.displayName]));

  const row = (levelId: string): BulkRow =>
    rows[levelId] ?? { include: false, mode: "home_section", sectionIds: [], periods: "", capacity: "" };
  const setRow = (levelId: string, patch: Partial<BulkRow>) => {
    setRows((current) => ({ ...current, [levelId]: { ...row(levelId), ...patch } }));
    save.clear();
  };
  const chosen = levels.teachable.filter((level) => row(level.id).include);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const sent = await save.send<BulkResult>(`${teachingApi.offerings}/bulk`, {
      method: "POST",
      body: {
        subjectId: String(form.get("subjectId")),
        academicYearId: yearId,
        academicPeriodId: periodId,
        levels: chosen.map((level) => {
          const value = row(level.id);
          return {
            academicLevelId: level.id,
            rosterMode: value.mode,
            ...(sectionRule(value.mode) ? { academicCycleSectionIds: value.sectionIds } : {}),
            plannedPeriodsPerWeek: value.periods ? Number(value.periods) : null,
            capacity: value.capacity ? Number(value.capacity) : null,
          };
        }),
      },
    });
    if (!sent.ok) return;
    setResult(sent.data);
    toast({
      title: `${sent.data.created.length} offerings created`,
      description: sent.data.skipped.length > 0 ? `${sent.data.skipped.length} skipped: see below.` : undefined,
    });
  }

  const errors = save.fieldErrors;

  return (
    <Page
      title="Offer to several classes"
      breadcrumbs={[{ label: "Subjects being taught", href: "/course-offerings" }, { label: "Offer to several classes" }]}
    >
      {ready && !can("create subject") ? (
        <NotAllowed />
      ) : (
        <div className="grid max-w-5xl gap-8">
          <form onSubmit={submit} className="grid gap-6">
            <fieldset disabled={save.submitting} className="grid gap-5 sm:grid-cols-3">
              <legend className="sr-only">Offerings</legend>
              <OfferingHead yearId={yearId} setYearId={setYearId} periodId={periodId} setPeriodId={setPeriodId} errors={errors} lookups={[levels.query, sectionsQuery]} />
            </fieldset>

            <fieldset disabled={save.submitting || !yearId} className="grid gap-2">
              <legend className="mb-2 text-lg font-medium">Classes</legend>
              {levels.teachable.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active classes. Activate classes first.</p>
              ) : (
                <ul className="grid gap-2">
                  {levels.teachable.map((level) => {
                    const value = row(level.id);
                    const rule = sectionRule(value.mode);
                    const levelSections = sections.filter((section) => section.academicLevelId === level.id && section.status !== "archived");
                    return (
                      <li key={level.id} className="grid gap-3 rounded-lg border p-3">
                        <label className="flex items-center gap-2 font-medium">
                          <input type="checkbox" className="size-4" checked={value.include} onChange={(event) => setRow(level.id, { include: event.target.checked })} />
                          {level.name}
                        </label>
                        {value.include && (
                          <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
                            <Field label="Who it teaches" htmlFor={`bulk-${level.id}-mode`}>
                              <Select
                                id={`bulk-${level.id}-mode`}
                                value={value.mode}
                                onChange={(event) => setRow(level.id, { mode: event.target.value as RosterMode, sectionIds: [] })}
                              >
                                <option value="home_section">Each section on its own</option>
                                <option value="combined_home_sections">Several sections combined</option>
                                <option value="academic_level">The whole class level</option>
                              </Select>
                            </Field>
                            <Field label="Periods / week" htmlFor={`bulk-${level.id}-ppw`}>
                              <Input
                                id={`bulk-${level.id}-ppw`}
                                type="number"
                                min={1}
                                max={80}
                                value={value.periods}
                                onChange={(event) => setRow(level.id, { periods: event.target.value })}
                              />
                            </Field>
                            <Field label="Capacity" htmlFor={`bulk-${level.id}-cap`}>
                              <Input
                                id={`bulk-${level.id}-cap`}
                                type="number"
                                min={1}
                                max={5000}
                                value={value.capacity}
                                onChange={(event) => setRow(level.id, { capacity: event.target.value })}
                              />
                            </Field>
                            {rule && (
                              <div className="flex flex-wrap gap-x-4 gap-y-1 sm:col-span-3">
                                {levelSections.length === 0 ? (
                                  <span className="text-sm text-muted-foreground">No sections in this year.</span>
                                ) : (
                                  levelSections.map((section) => (
                                    <label key={section.id} className="flex items-center gap-2 text-sm">
                                      <input
                                        type="checkbox"
                                        className="size-4"
                                        checked={value.sectionIds.includes(section.id)}
                                        onChange={(event) =>
                                          setRow(level.id, {
                                            sectionIds: event.target.checked
                                              ? [...value.sectionIds, section.id]
                                              : value.sectionIds.filter((id) => id !== section.id),
                                          })
                                        }
                                      />
                                      {section.name}
                                    </label>
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </fieldset>

            <FormError error={save.error} fields={["subjectId", "academicYearId", "academicPeriodId"]} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={save.submitting || chosen.length === 0}>
                {save.submitting ? "Creating…" : `Create offerings for ${chosen.length} ${chosen.length === 1 ? "class" : "classes"}`}
              </Button>
              <ButtonLink href="/course-offerings" variant="outline">
                {result ? "Done" : "Cancel"}
              </ButtonLink>
            </div>
          </form>

          {result && (
            <section className="grid gap-4" aria-labelledby="bulk-result">
              <h2 id="bulk-result" className="text-lg font-medium">
                Result
              </h2>
              <Alert tone={result.created.length > 0 ? "success" : "warning"} title={`${result.created.length} created, ${result.skipped.length} skipped`}>
                New offerings start as drafts.
              </Alert>
              {result.skipped.length > 0 && (
                <Table>
                  <THead>
                    <TH>Class</TH>
                    <TH>Term</TH>
                    <TH>Why it was skipped</TH>
                  </THead>
                  <tbody>
                    {result.skipped.map((skip, index) => (
                      <TR key={`${skip.academicLevelId}-${skip.academicPeriodId}-${index}`}>
                        <TD>{levels.name.get(skip.academicLevelId) ?? "—"}</TD>
                        <TD>{periodName.get(skip.academicPeriodId) ?? "—"}</TD>
                        <TD>{skip.reason}</TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              )}
            </section>
          )}
        </div>
      )}
    </Page>
  );
}
