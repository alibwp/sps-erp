"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { useWorkingContext } from "@/components/auth/session";
import { StatusBadge } from "@/components/academic/status-dialogs";
import { Page } from "@/components/layout/page-header";
import { FormError, Loaded } from "@/components/ui/api-states";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert, EmptyState } from "@/components/ui/misc";
import { Pagination, Table, TD, TH, THead, TR } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { withQuery, type Paginated } from "@/lib/api";
import {
  academicApi,
  ACADEMIC_STATUS_LABELS,
  MAX_CALENDAR_PERIODS,
  periodTypeLabel,
  TOP_LEVEL_TYPES,
  type AcademicStatus,
  type Year,
  type YearDetail,
} from "@/lib/academic";
import { useApiMutation, useApiQuery } from "@/lib/use-api";
import { formatDate } from "@/lib/utils";

const PER_PAGE = 10;

/** "New school year", for people who may create one. */
export function NewYearButton() {
  const { can } = useWorkingContext();
  if (!can("create academic year")) return null;
  return (
    <ButtonLink href="/academic-years/create">
      <Plus /> New school year
    </ButtonLink>
  );
}

/** The campus's school years, newest first, filtered by status. */
export function YearList() {
  const { schoolId } = useWorkingContext();
  const [status, setStatus] = useState<AcademicStatus | "">("");
  const [page, setPage] = useState(1);
  const years = useApiQuery<Paginated<Year>>(
    schoolId ? withQuery(academicApi.years, { page, perPage: PER_PAGE, status }) : null,
    { keepPrevious: true },
  );

  return (
    <div className="grid gap-4">
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        Status
        <Select
          className="h-9 w-44"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as AcademicStatus | "");
            setPage(1);
          }}
        >
          <option value="">Every status</option>
          {(Object.keys(ACADEMIC_STATUS_LABELS) as AcademicStatus[]).map((value) => (
            <option key={value} value={value}>
              {ACADEMIC_STATUS_LABELS[value]}
            </option>
          ))}
        </Select>
      </label>
      <Loaded query={years}>
        {({ data, meta }) =>
          data.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title={status ? "No school year with this status" : "No school years yet"}
              description="A school year holds its terms, sections and subjects being taught."
            />
          ) : (
            <>
              <Table busy={years.loading}>
                <THead>
                  <TH>School year</TH>
                  <TH>Starts</TH>
                  <TH>Ends</TH>
                  <TH>Status</TH>
                </THead>
                <tbody>
                  {data.map((year) => (
                    <TR key={year.id}>
                      <TD>
                        <span className="flex flex-wrap items-center gap-2">
                          <Link href={`/academic-years/${year.id}`} className="font-medium hover:underline hover:underline-offset-4">
                            {year.name}
                          </Link>
                          {year.isCampusDefault && <Badge tone="info">Campus default</Badge>}
                        </span>
                      </TD>
                      <TD className="whitespace-nowrap">{formatDate(year.startsOn)}</TD>
                      <TD className="whitespace-nowrap">{formatDate(year.endsOn)}</TD>
                      <TD>
                        <StatusBadge status={year.status} />
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

// ---------------------------------------------------------------- Calendar form

type PeriodRow = { key: string; id?: string; name: string; type: string; startsOn: string; endsOn: string };

let rowCounter = 0;
const newKey = () => `period-${++rowCounter}`;

/** The day after an ISO date. */
function dayAfter(iso: string): string {
  if (!iso) return "";
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** /academic-years/create */
export function CreateYear() {
  const { ready, can } = useWorkingContext();
  return (
    <Page title="New school year" breadcrumbs={[{ label: "School years", href: "/academic-years" }, { label: "New school year" }]}>
      {ready && !can("create academic year") ? (
        <Alert tone="warning" icon={ShieldAlert} title="You cannot create school years">
          Creating a school year needs the “create academic year” permission.
        </Alert>
      ) : (
        <CalendarForm />
      )}
    </Page>
  );
}

/** /academic-years/[id]/edit: a draft's calendar is rewritten whole. */
export function EditYear({ id }: { id: string }) {
  const year = useApiQuery<YearDetail>(academicApi.year(id));
  const name = year.data?.name ?? "School year";
  return (
    <Page
      title={`Edit ${name}`}
      breadcrumbs={[{ label: "School years", href: "/academic-years" }, { label: name, href: `/academic-years/${id}` }, { label: "Edit" }]}
    >
      <Loaded query={year}>
        {(data) =>
          data.status === "draft" ? (
            <CalendarForm year={data} />
          ) : (
            <Alert tone="warning" title="Only a draft calendar can be rewritten">
              This year is {ACADEMIC_STATUS_LABELS[data.status].toLowerCase()}. Change its dates or add periods from the{" "}
              <Link href={`/academic-years/${id}`} className="underline">
                year page
              </Link>
              .
            </Alert>
          )
        }
      </Loaded>
    </Page>
  );
}

/**
 * POST /v1/academic-years or PUT /v1/academic-years/:id (drafts): the year
 * and its top-level periods. Periods kept by id keep what is inside them;
 * periods left out are removed with their contents.
 */
function CalendarForm({ year }: { year?: YearDetail }) {
  const router = useRouter();
  const toast = useToast();
  const save = useApiMutation();
  const id = useId();
  const [startsOn, setStartsOn] = useState(year?.startsOn ?? "");
  const [endsOn, setEndsOn] = useState(year?.endsOn ?? "");
  const [rows, setRows] = useState<PeriodRow[]>(() =>
    year
      ? year.periods.map((period) => ({
          key: newKey(),
          id: period.id,
          name: period.name,
          type: period.type,
          startsOn: period.startsOn ?? "",
          endsOn: period.endsOn ?? "",
        }))
      : [{ key: newKey(), name: "First term", type: "term", startsOn: "", endsOn: "" }],
  );
  const editing = year !== undefined;

  const setRow = (key: string, patch: Partial<PeriodRow>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
    save.clear();
  };

  function addRow() {
    setRows((current) => {
      const last = current.at(-1);
      const start = last?.endsOn ? dayAfter(last.endsOn) : "";
      return [...current, { key: newKey(), name: "", type: last?.type ?? "term", startsOn: start, endsOn: "" }];
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = {
      startsOn,
      endsOn,
      periods: rows.map((row) => ({
        ...(row.id ? { id: row.id } : {}),
        name: row.name.trim(),
        type: row.type,
        startsOn: row.startsOn,
        endsOn: row.endsOn,
      })),
    };
    const sent = await save.send<YearDetail>(year ? academicApi.year(year.id) : academicApi.years, {
      method: year ? "PUT" : "POST",
      body,
    });
    if (!sent.ok) return;
    toast({
      title: editing ? "Calendar saved" : "School year created",
      description: editing ? sent.data.name : `${sent.data.name} is a draft until you publish it.`,
    });
    router.push(`/academic-years/${sent.data.id}`);
  }

  const errors = save.fieldErrors;
  const rowError = (index: number, field: string) => errors[`periods.${index}.${field}`];
  const shown = ["startsOn", "endsOn", ...rows.flatMap((_, index) => ["name", "type", "startsOn", "endsOn"].map((f) => `periods.${index}.${f}`))];

  return (
    <form onSubmit={submit} className="grid max-w-4xl gap-8">
      <fieldset disabled={save.submitting} className="grid gap-8">
        <section className="grid gap-4 sm:grid-cols-2" aria-labelledby={`${id}-year`}>
          <div className="sm:col-span-2">
            <h2 id={`${id}-year`} className="text-lg font-medium">
              School year
            </h2>
            <p className="text-sm text-muted-foreground">
              The name follows from the dates, e.g. 2026–27. It must not overlap another year of the campus.
            </p>
          </div>
          <Field label="First day" htmlFor={`${id}-start`} error={errors.startsOn}>
            <Input
              id={`${id}-start`}
              type="date"
              value={startsOn}
              onChange={(event) => {
                setStartsOn(event.target.value);
                save.clear();
              }}
              required
            />
          </Field>
          <Field label="Last day" htmlFor={`${id}-end`} error={errors.endsOn}>
            <Input
              id={`${id}-end`}
              type="date"
              value={endsOn}
              min={startsOn || undefined}
              onChange={(event) => {
                setEndsOn(event.target.value);
                save.clear();
              }}
              required
            />
          </Field>
        </section>

        <section className="grid gap-4" aria-labelledby={`${id}-periods`}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id={`${id}-periods`} className="text-lg font-medium">
                Terms
              </h2>
              <p className="text-sm text-muted-foreground">
                Up to {MAX_CALENDAR_PERIODS}. They sit inside the year and must not overlap. Exam windows and holidays are added
                inside a term after saving.
                {editing && " Removing a term removes what is inside it."}
              </p>
            </div>
            <Button variant="outline" onClick={addRow} disabled={rows.length >= MAX_CALENDAR_PERIODS}>
              <Plus /> Add term
            </Button>
          </div>
          <ol className="grid gap-3">
            {rows.map((row, index) => (
              <li key={row.key} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                <Field label={`Term ${index + 1}`} htmlFor={`${row.key}-name`} error={rowError(index, "name")}>
                  <Input
                    id={`${row.key}-name`}
                    value={row.name}
                    onChange={(event) => setRow(row.key, { name: event.target.value })}
                    required
                    maxLength={100}
                    placeholder="First term"
                  />
                </Field>
                <Field label="Type" htmlFor={`${row.key}-type`} error={rowError(index, "type")}>
                  <Select id={`${row.key}-type`} value={row.type} onChange={(event) => setRow(row.key, { type: event.target.value })}>
                    {TOP_LEVEL_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {periodTypeLabel(type)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Starts" htmlFor={`${row.key}-start`} error={rowError(index, "startsOn")}>
                  <Input
                    id={`${row.key}-start`}
                    type="date"
                    value={row.startsOn}
                    min={startsOn || undefined}
                    max={endsOn || undefined}
                    onChange={(event) => setRow(row.key, { startsOn: event.target.value })}
                    required
                  />
                </Field>
                <Field label="Ends" htmlFor={`${row.key}-end`} error={rowError(index, "endsOn")}>
                  <Input
                    id={`${row.key}-end`}
                    type="date"
                    value={row.endsOn}
                    min={row.startsOn || startsOn || undefined}
                    max={endsOn || undefined}
                    onChange={(event) => setRow(row.key, { endsOn: event.target.value })}
                    required
                  />
                </Field>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove term ${index + 1}`}
                  disabled={rows.length === 1}
                  onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ol>
        </section>
      </fieldset>

      <FormError error={save.error} fields={shown} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={save.submitting}>
          {save.submitting ? "Saving…" : editing ? "Save calendar" : "Create school year"}
        </Button>
        <ButtonLink href={year ? `/academic-years/${year.id}` : "/academic-years"} variant="outline">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}
