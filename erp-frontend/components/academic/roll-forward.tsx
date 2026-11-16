"use client";

import { ArrowRight, CircleAlert, CircleCheck, Copy, MinusCircle } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { refreshContext, useWorkingContext } from "@/components/auth/session";
import { useLevels, useSections, useYears } from "@/components/academic/lookups";
import { Loaded, LookupError } from "@/components/ui/api-states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { academicApi, isFrozen, rosterModeLabel, type Year, type YearDetail } from "@/lib/academic";
import type { Offering, SectionBrief } from "@/lib/teaching";
import { useApiMutation, useApiQuery, type ApiQuery } from "@/lib/use-api";
import { cn } from "@/lib/utils";

// Year-end roll-forward: copy last year's setup into this one, in three steps
// that must run in order, because each matches on what the step before made:
//   1. teaching model and terms   (GET/POST …/roll-forward)
//   2. sections                   (GET/POST …/sections/roll-forward)
//   3. subjects being taught      (GET/POST …/course-offerings/roll-forward)
// Every step previews first; only what this year lacks is copied, and copies
// start as drafts. Running a step again copies nothing twice.

type SetupItem = { key: string; title: string; description: string; details: string[]; count: number; willCreate: boolean };
type SetupPreview = { items: SetupItem[]; createCount: number };
type SetupResult = { instructionalModel: boolean; academicPeriods: number };

type SectionPreview = { copies: SectionBrief[]; skips: SectionBrief[]; leftBehind: SectionBrief[] };
type SectionResult = { created: unknown[] };

type OfferingCopy = { offering: Offering; academicPeriodId: string; periodName: string; sectionCount: number };
type OfferingPreview = { copies: OfferingCopy[]; skips: Offering[]; problems: Array<{ offering: Offering; reason: string }> };
type OfferingResult = { created: Offering[] };

/** The year that most likely feeds this one: the latest that starts before it. */
function previousYear(years: Year[], target: YearDetail): Year | undefined {
  return years
    .filter((year) => year.id !== target.id && year.startYear < target.startYear)
    .sort((a, b) => b.startYear - a.startYear)[0];
}

/** The year page's "Roll forward" tab. Only for people who can run at least one step. */
export function useCanRollForward(year: YearDetail): boolean {
  const { can } = useWorkingContext();
  return !isFrozen(year.status) && (can("update academic year") || can("create section") || can("create subject"));
}

export function RollForwardPanel({ year, onChanged }: { year: YearDetail; onChanged: () => void }) {
  const { can } = useWorkingContext();
  const { query: yearsQuery, years } = useYears();
  const [picked, setPicked] = useState<string | null>(null);
  // Bumped after any step runs, so every preview reads again.
  const [version, setVersion] = useState(0);

  const sources = years.filter((item) => item.id !== year.id);
  const sourceId = picked ?? previousYear(years, year)?.id ?? "";
  const source = sources.find((item) => item.id === sourceId);

  const ran = () => {
    setVersion((value) => value + 1);
    onChanged();
    void refreshContext().catch(() => undefined);
  };

  return (
    <div className="grid max-w-5xl gap-8">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,20rem)_1fr] sm:items-end">
        <Field label="Copy from" htmlFor="roll-source" help="Usually last year.">
          <Select id="roll-source" value={sourceId} onChange={(event) => setPicked(event.target.value)} disabled={yearsQuery.loading}>
            <option value="" disabled>
              {sources.length === 0 ? "No other school year" : "Choose a school year"}
            </option>
            {sources.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </Field>
        {source && (
          <p className="flex flex-wrap items-center gap-2 pb-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{source.name}</span>
            <ArrowRight className="size-4" aria-hidden />
            <span className="font-medium text-foreground">{year.name}</span>
            · only what {year.name} lacks is copied, as drafts.
          </p>
        )}
      </div>

      <LookupError queries={[yearsQuery]} />
      {!source ? (
        <Alert tone="default">Choose the school year to copy from.</Alert>
      ) : (
        <ol className="grid gap-6">
          {can("update academic year") && (
            <SetupStep key={`setup-${sourceId}-${version}`} number={1} target={year} source={source} onRan={ran} />
          )}
          {can("create section") && (
            <SectionsStep key={`sections-${sourceId}-${version}`} number={2} target={year} source={source} onRan={ran} />
          )}
          {can("create subject") && (
            <OfferingsStep key={`offerings-${sourceId}-${version}`} number={3} target={year} source={source} onRan={ran} />
          )}
        </ol>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Shared step frame

function Step({
  number,
  title,
  description,
  willCopy,
  query,
  confirmText,
  running,
  onRun,
  children,
}: {
  number: number;
  title: string;
  description: string;
  /** How many records the step would create; 0 disables it. */
  willCopy: number;
  query: ApiQuery<unknown>;
  confirmText: string;
  running: boolean;
  onRun: () => void;
  children: ReactNode;
}) {
  const [confirming, setConfirming] = useState(false);
  const ready = query.data !== undefined;

  return (
    <li className="grid gap-4 rounded-lg border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "inline-flex size-7 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
              ready && willCopy === 0 && "border-success bg-success/10 text-success",
            )}
            aria-hidden
          >
            {ready && willCopy === 0 ? <CircleCheck className="size-4" /> : number}
          </span>
          <div>
            <h3 className="font-medium">
              <span className="sr-only">Step {number}: </span>
              {title}
            </h3>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        <Button onClick={() => setConfirming(true)} disabled={!ready || willCopy === 0 || running}>
          <Copy /> {running ? "Copying…" : willCopy > 0 ? `Copy ${willCopy}` : "Nothing to copy"}
        </Button>
      </div>
      <Loaded query={query}>{() => children}</Loaded>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={onRun}
        title={`${title}?`}
        description={confirmText}
        confirmLabel="Copy"
        destructive={false}
      />
    </li>
  );
}

/** A labelled list of names, e.g. "Will copy · 4". */
function Group({ tone, icon, title, items, empty }: { tone: "success" | "neutral" | "danger"; icon: ReactNode; title: string; items: ReactNode[]; empty?: string }) {
  if (items.length === 0 && !empty) return null;
  return (
    <div className="grid gap-2">
      <p className="flex items-center gap-2 text-sm font-medium">
        {icon} {title} <Badge tone={tone}>{items.length}</Badge>
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">{items}</ul>
      )}
    </div>
  );
}

const chip = (key: string, text: string) => (
  <li key={key} className="rounded-md border bg-muted/40 px-2 py-0.5 text-xs">
    {text}
  </li>
);

// ---------------------------------------------------------------- 8.1 Teaching model and terms

function SetupStep({ number, target, source, onRan }: { number: number; target: YearDetail; source: Year; onRan: () => void }) {
  const toast = useToast();
  const run = useApiMutation();
  const path = `${academicApi.year(target.id)}/roll-forward`;
  const preview = useApiQuery<SetupPreview>(`${path}?sourceYearId=${source.id}`);

  async function copy() {
    const sent = await run.send<SetupResult>(path, { method: "POST", body: { sourceYearId: source.id } });
    if (!sent.ok) {
      toast({ title: "Could not copy the setup", description: sent.error.message, tone: "error" });
      return;
    }
    const parts = [
      sent.data.instructionalModel && "the teaching model",
      sent.data.academicPeriods > 0 && `${sent.data.academicPeriods} ${sent.data.academicPeriods === 1 ? "period" : "periods"}`,
    ].filter(Boolean);
    toast({ title: "Setup copied", description: parts.length ? `Copied ${parts.join(" and ")}.` : "Nothing was missing." });
    onRan();
  }

  return (
    <Step
      number={number}
      title="Teaching model and terms"
      description="How the year is taught, and its terms with the periods inside them. Dates move forward by whole years."
      willCopy={preview.data?.createCount ?? 0}
      query={preview}
      confirmText={`Copy what ${target.name} lacks from ${source.name}. New terms start as drafts.`}
      running={run.submitting}
      onRun={() => void copy()}
    >
      <ul className="grid gap-3">
        {preview.data?.items.map((item) => (
          <li key={item.key} className="grid gap-1">
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{item.title}</span>
              {item.willCreate ? <Badge tone="success">Will copy</Badge> : <Badge>Already set</Badge>}
            </p>
            <p className="text-sm text-muted-foreground">{item.description}</p>
            {item.details.length > 0 && <ul className="flex flex-wrap gap-1.5">{item.details.map((detail, index) => chip(`${item.key}-${index}`, detail))}</ul>}
          </li>
        ))}
      </ul>
    </Step>
  );
}

// ---------------------------------------------------------------- 8.2 Sections

function SectionsStep({ number, target, source, onRan }: { number: number; target: YearDetail; source: Year; onRan: () => void }) {
  const toast = useToast();
  const run = useApiMutation();
  const levels = useLevels();
  const path = `${academicApi.year(target.id)}/sections/roll-forward`;
  const preview = useApiQuery<SectionPreview>(`${path}?sourceYearId=${source.id}`);
  const label = (section: SectionBrief) => `${levels.name.get(section.academicLevelId) ?? ""} · ${section.name}`.replace(/^ · /, "");

  async function copy() {
    const sent = await run.send<SectionResult>(path, { method: "POST", body: { sourceYearId: source.id } });
    if (!sent.ok) {
      toast({ title: "Could not copy the sections", description: sent.error.message, tone: "error" });
      return;
    }
    const count = sent.data.created.length;
    toast({ title: `${count} ${count === 1 ? "section" : "sections"} copied`, description: "They start as drafts, without a class teacher." });
    onRan();
  }

  const data = preview.data;
  return (
    <Step
      number={number}
      title="Sections"
      description="Sections of active classes that this year lacks by name. Copies have no class teacher yet."
      willCopy={data?.copies.length ?? 0}
      query={preview}
      confirmText={`Copy ${data?.copies.length ?? 0} sections from ${source.name} into ${target.name} as drafts.`}
      running={run.submitting}
      onRun={() => void copy()}
    >
      {data && (
        <div className="grid gap-4">
          <Group
            tone="success"
            icon={<Copy className="size-4 text-success" aria-hidden />}
            title="Will copy"
            items={data.copies.map((section) => chip(section.id, label(section)))}
            empty="Nothing new to copy."
          />
          <Group
            tone="neutral"
            icon={<MinusCircle className="size-4 text-muted-foreground" aria-hidden />}
            title="Already here (same name)"
            items={data.skips.map((section) => chip(section.id, label(section)))}
          />
          <Group
            tone="danger"
            icon={<CircleAlert className="size-4 text-destructive" aria-hidden />}
            title="Left behind (archived, or its class is not active)"
            items={data.leftBehind.map((section) => chip(section.id, label(section)))}
          />
        </div>
      )}
    </Step>
  );
}

// ---------------------------------------------------------------- 8.3 Subjects being taught

function OfferingsStep({ number, target, source, onRan }: { number: number; target: YearDetail; source: Year; onRan: () => void }) {
  const toast = useToast();
  const run = useApiMutation();
  const levels = useLevels();
  const { name: sectionName } = useSections(source.id);
  const path = `${academicApi.year(target.id)}/course-offerings/roll-forward`;
  const preview = useApiQuery<OfferingPreview>(`${path}?sourceYearId=${source.id}`);
  const data = preview.data;

  const describe = (offering: Offering) =>
    [offering.subject.name + (offering.name ? ` (${offering.name})` : ""), levels.name.get(offering.academicLevelId)].filter(Boolean).join(" · ");
  const roster = (offering: Offering) =>
    offering.academicCycleSectionIds.length > 0
      ? offering.academicCycleSectionIds.map((id) => sectionName.get(id) ?? "?").join(", ")
      : rosterModeLabel(offering.rosterMode);

  const skips = useMemo(() => data?.skips ?? [], [data]);

  async function copy() {
    const sent = await run.send<OfferingResult>(path, { method: "POST", body: { sourceYearId: source.id } });
    if (!sent.ok) {
      toast({ title: "Could not copy the subjects", description: sent.error.message, tone: "error" });
      return;
    }
    const count = sent.data.created.length;
    toast({ title: `${count} ${count === 1 ? "offering" : "offerings"} copied`, description: "They start as drafts: assign teachers, then activate them." });
    onRan();
  }

  return (
    <Step
      number={number}
      title="Subjects being taught"
      description="Offerings matched to this year's terms (by name, type and position) and sections (by class and name). Run steps 1 and 2 first."
      willCopy={data?.copies.length ?? 0}
      query={preview}
      confirmText={`Copy ${data?.copies.length ?? 0} offerings from ${source.name} into ${target.name} as drafts. Teachers are not copied.`}
      running={run.submitting}
      onRun={() => void copy()}
    >
      {data && (
        <div className="grid gap-5">
          {data.problems.length > 0 && (
            <Alert tone="warning" icon={CircleAlert} title={`${data.problems.length} cannot be copied`}>
              Usually a term or section is missing in {target.name}. Run the earlier steps, or add what is missing, then come back.
            </Alert>
          )}
          {data.copies.length === 0 && data.problems.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing new to copy.</p>
          ) : (
            <Table>
              <THead>
                <TH>Subject and class</TH>
                <TH>Roster</TH>
                <TH>Into term</TH>
                <TH>Outcome</TH>
              </THead>
              <tbody>
                {data.copies.map((copy) => (
                  <TR key={copy.offering.id}>
                    <TD className="font-medium">{describe(copy.offering)}</TD>
                    <TD>{roster(copy.offering)}</TD>
                    <TD>{copy.periodName}</TD>
                    <TD>
                      <Badge tone="success">Will copy</Badge>
                    </TD>
                  </TR>
                ))}
                {data.problems.map((problem) => (
                  <TR key={problem.offering.id}>
                    <TD className="font-medium">{describe(problem.offering)}</TD>
                    <TD>{roster(problem.offering)}</TD>
                    <TD>—</TD>
                    <TD className="max-w-80 text-destructive">{problem.reason}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
          <Group
            tone="neutral"
            icon={<MinusCircle className="size-4 text-muted-foreground" aria-hidden />}
            title="Already taught this year"
            items={skips.map((offering) => chip(offering.id, describe(offering)))}
          />
        </div>
      )}
    </Step>
  );
}
