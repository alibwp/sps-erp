"use client";

import { useRouter } from "next/navigation";
import { Plus, ShieldAlert, Trash2 } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { Page } from "@/components/layout/page-header";
import { useOrganizationChoice, WithOrganization } from "@/components/organizations/organization-picker";
import { cycleLength } from "@/components/organizations/templates-panel";
import { FormError, Loaded } from "@/components/ui/api-states";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import {
  orgApi,
  orgCan,
  OrgPermission,
  PERIOD_TYPES,
  TEMPLATE_LIMITS,
  type CalendarTemplate,
  type OrganizationDto,
  type PeriodType,
  type TemplatePeriod,
} from "@/lib/organizations";
import { useApiMutation, useApiQuery } from "@/lib/use-api";

// A calendar template: a school year as rows of days counted from its first
// day. A row may sit inside an earlier row (a half term inside a term); rows
// side by side must not overlap and every row must end inside the cycle. The
// backend checks all of that (SaveTemplateDto, checkTemplatePeriods); the
// editor shows each row's days so mistakes are visible before saving.

type Row = {
  key: string;
  name: string;
  label: string;
  type: PeriodType;
  /** Kept as typed so a half-typed number is not lost. */
  start: string;
  length: string;
  /** 1-based number of an earlier row, or null for a top-level row. */
  parent: number | null;
};

type Draft = {
  name: string;
  description: string;
  cycleLengthDays: string;
  isDefault: boolean;
  autoOpen: boolean;
  generateAheadWeeks: string;
  remindDaysBefore: string;
  rows: Row[];
};

let rowCounter = 0;
const newKey = () => `row-${++rowCounter}`;

function blankRow(previous?: Row): Row {
  // A new row starts where the previous top-level row ends.
  const start = previous ? Number(previous.start || 0) + Number(previous.length || 0) : 0;
  return { key: newKey(), name: "", label: "", type: "term", start: String(start), length: "90", parent: null };
}

const NEW_TEMPLATE: Draft = {
  name: "",
  description: "",
  cycleLengthDays: "365",
  isDefault: false,
  autoOpen: true,
  generateAheadWeeks: "8",
  remindDaysBefore: "14",
  rows: [],
};

/** Saved periods → rows with every parent before its children. */
function rowsFrom(periods: TemplatePeriod[]): Row[] {
  const sorted = [...periods].sort((a, b) => a.position - b.position || a.startOffsetDays - b.startOffsetDays);
  const ordered: TemplatePeriod[] = [];
  const place = (period: TemplatePeriod) => {
    if (ordered.includes(period)) return;
    const parent = period.parentId ? sorted.find((item) => item.id === period.parentId) : undefined;
    if (parent) place(parent);
    ordered.push(period);
  };
  sorted.forEach(place);
  return ordered.map((period) => {
    const parentIndex = period.parentId ? ordered.findIndex((item) => item.id === period.parentId) : -1;
    return {
      key: newKey(),
      name: period.name,
      label: period.label ?? "",
      type: period.type,
      start: String(period.startOffsetDays),
      length: String(period.lengthDays),
      parent: parentIndex >= 0 ? parentIndex + 1 : null,
    };
  });
}

function draftFrom(template: CalendarTemplate): Draft {
  return {
    name: template.name,
    description: template.description ?? "",
    cycleLengthDays: String(template.cycleLengthDays),
    isDefault: template.isDefault,
    autoOpen: template.autoOpen,
    generateAheadWeeks: String(template.generateAheadWeeks),
    remindDaysBefore: String(template.remindDaysBefore),
    rows: rowsFrom(template.periods),
  };
}

/** The editor page; the organization comes from ?org=. */
export function TemplateEditorScreen({ templateId }: { templateId?: string }) {
  const choice = useOrganizationChoice();
  return (
    <WithOrganization choice={choice}>
      {(organization) =>
        templateId ? (
          <ExistingTemplate organization={organization} templateId={templateId} />
        ) : (
          <EditorPage organization={organization} />
        )
      }
    </WithOrganization>
  );
}

function ExistingTemplate({ organization, templateId }: { organization: OrganizationDto; templateId: string }) {
  const template = useApiQuery<CalendarTemplate>(orgApi.template(organization.id, templateId));
  return (
    <Loaded query={template} className="p-4 md:p-8">
      {(data) => <EditorPage organization={organization} template={data} />}
    </Loaded>
  );
}

function EditorPage({ organization, template }: { organization: OrganizationDto; template?: CalendarTemplate }) {
  const canManage = orgCan(organization, OrgPermission.Manage);
  const listHref = `/calendar-templates?org=${organization.id}`;
  const title = template ? template.name : "New calendar template";

  return (
    <Page
      title={title}
      breadcrumbs={[{ label: "Calendar templates", href: listHref }, { label: title }]}
    >
      {!canManage && (
        <Alert tone="warning" icon={ShieldAlert} title="View only" className="mb-6">
          Changing calendar templates needs the “manage organization” permission at {organization.name}.
        </Alert>
      )}
      {!template && !canManage ? null : (
        <TemplateForm
          // A fresh form for each saved version.
          key={template ? `${template.id}-${JSON.stringify(template.periods.map((period) => period.id))}` : "new"}
          organization={organization}
          template={template}
          readOnly={!canManage}
          listHref={listHref}
        />
      )}
    </Page>
  );
}

function TemplateForm({
  organization,
  template,
  readOnly,
  listHref,
}: {
  organization: OrganizationDto;
  template?: CalendarTemplate;
  readOnly: boolean;
  listHref: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const save = useApiMutation();
  const id = useId();
  const [draft, setDraft] = useState<Draft>(() => (template ? draftFrom(template) : { ...NEW_TEMPLATE, rows: [blankRow()] }));

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    save.clear();
  };
  const setRow = (index: number, patch: Partial<Row>) => {
    setDraft((current) => ({
      ...current,
      rows: current.rows.map((row, at) => (at === index ? { ...row, ...patch } : row)),
    }));
    save.clear();
  };

  function addRow() {
    setDraft((current) => {
      const lastTop = [...current.rows].reverse().find((row) => row.parent === null);
      return { ...current, rows: [...current.rows, blankRow(lastTop)] };
    });
  }

  function removeRow(index: number) {
    const removed = index + 1;
    setDraft((current) => ({
      ...current,
      rows: current.rows
        .filter((_, at) => at !== index)
        // Rows inside the removed one become top-level; later parent numbers move up.
        .map((row) => ({
          ...row,
          parent: row.parent === removed ? null : row.parent !== null && row.parent > removed ? row.parent - 1 : row.parent,
        })),
    }));
    save.clear();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = {
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      cycleLengthDays: Number(draft.cycleLengthDays),
      isDefault: draft.isDefault,
      autoOpen: draft.autoOpen,
      generateAheadWeeks: Number(draft.generateAheadWeeks),
      remindDaysBefore: Number(draft.remindDaysBefore),
      periods: draft.rows.map((row, index) => ({
        name: row.name.trim(),
        label: row.label.trim() || null,
        type: row.type,
        position: index + 1,
        startOffsetDays: Number(row.start),
        lengthDays: Number(row.length),
        parentIndex: row.parent,
      })),
    };
    const sent = await save.send<CalendarTemplate>(
      template ? orgApi.template(organization.id, template.id) : orgApi.templates(organization.id),
      { method: template ? "PUT" : "POST", body },
    );
    if (!sent.ok) return;
    toast({
      title: template ? "Template saved" : "Template created",
      description: template ? "Years already drafted from it do not change." : sent.data.name,
    });
    router.push(listHref);
  }

  const errors = save.fieldErrors;
  const cycleDays = Number(draft.cycleLengthDays) || 0;
  const rowError = (index: number, field: string) => errors[`periods.${index}.${field}`];
  const topFields = ["name", "description", "cycleLengthDays", "isDefault", "autoOpen", "generateAheadWeeks", "remindDaysBefore"];
  const shownFields = [
    ...topFields,
    ...draft.rows.flatMap((_, index) =>
      ["name", "label", "type", "startOffsetDays", "lengthDays", "parentIndex"].map((field) => `periods.${index}.${field}`),
    ),
  ];

  return (
    <form onSubmit={submit} className="grid max-w-5xl gap-10">
      <fieldset disabled={readOnly || save.submitting} className="grid gap-10">
        <section className="grid gap-5 sm:grid-cols-2" aria-labelledby={`${id}-about`}>
          <h2 id={`${id}-about`} className="text-lg font-medium sm:col-span-2">
            Template
          </h2>
          <Field label="Name" htmlFor={`${id}-name`} error={errors.name}>
            <Input
              id={`${id}-name`}
              value={draft.name}
              onChange={(event) => set("name", event.target.value)}
              required
              maxLength={100}
              placeholder="Federal board calendar"
            />
          </Field>
          <Field
            label="Length of the school year (days)"
            htmlFor={`${id}-cycle`}
            error={errors.cycleLengthDays}
            help={cycleDays > 0 ? cycleLength(cycleDays) : undefined}
          >
            <Input
              id={`${id}-cycle`}
              type="number"
              min={1}
              max={TEMPLATE_LIMITS.cycleDays}
              value={draft.cycleLengthDays}
              onChange={(event) => set("cycleLengthDays", event.target.value)}
              required
            />
          </Field>
          <Field label="Description" htmlFor={`${id}-description`} error={errors.description} className="sm:col-span-2">
            <Textarea
              id={`${id}-description`}
              value={draft.description}
              onChange={(event) => set("description", event.target.value)}
              maxLength={500}
              rows={2}
            />
          </Field>
          <Field
            label="Draft next year ahead (weeks)"
            htmlFor={`${id}-ahead`}
            error={errors.generateAheadWeeks}
            help="Draft the next school year this many weeks before it starts. 0: never."
          >
            <Input
              id={`${id}-ahead`}
              type="number"
              min={0}
              max={TEMPLATE_LIMITS.aheadWeeks}
              value={draft.generateAheadWeeks}
              onChange={(event) => set("generateAheadWeeks", event.target.value)}
              required
            />
          </Field>
          <Field
            label="Remind before a period starts (days)"
            htmlFor={`${id}-remind`}
            error={errors.remindDaysBefore}
            help="0: no reminders."
          >
            <Input
              id={`${id}-remind`}
              type="number"
              min={0}
              max={TEMPLATE_LIMITS.remindDays}
              value={draft.remindDaysBefore}
              onChange={(event) => set("remindDaysBefore", event.target.value)}
              required
            />
          </Field>
          <ToggleRow
            id={`${id}-default`}
            label="Organization default"
            description="Campuses without a template of their own follow it. Making this the default stops the previous one being it."
            checked={draft.isDefault}
            onChange={(value) => set("isDefault", value)}
            disabled={readOnly}
          />
          <ToggleRow
            id={`${id}-autoopen`}
            label="Open periods on their start date"
            description="Scheduled years and periods open by themselves on their first day."
            checked={draft.autoOpen}
            onChange={(value) => set("autoOpen", value)}
            disabled={readOnly}
          />
        </section>

        <section className="grid gap-4" aria-labelledby={`${id}-periods`}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id={`${id}-periods`} className="text-lg font-medium">
                Periods
              </h2>
              <p className="text-sm text-muted-foreground">
                Day 1 is the first day of the school year. A row can sit inside an earlier row; rows side by side must not overlap.
              </p>
            </div>
            {!readOnly && (
              <Button variant="outline" onClick={addRow} disabled={draft.rows.length >= TEMPLATE_LIMITS.periods}>
                <Plus /> Add period
              </Button>
            )}
          </div>

          {draft.rows.length === 0 && <p className="text-sm text-muted-foreground">Add at least one period.</p>}

          <ol className="grid gap-3">
            {draft.rows.map((row, index) => {
              const start = Number(row.start);
              const length = Number(row.length);
              const valid = Number.isFinite(start) && Number.isFinite(length) && length > 0;
              const lastDay = start + length;
              const overruns = valid && cycleDays > 0 && lastDay > cycleDays;
              const prefix = `${id}-row-${row.key}`;
              return (
                <li key={row.key} className={row.parent !== null ? "ml-6 border-l-2 pl-4" : undefined}>
                  <fieldset className="grid gap-3 rounded-lg border p-4">
                    <legend className="px-1 text-sm font-medium">
                      Row {index + 1}
                      {valid && (
                        <span className={overruns ? "ml-2 font-normal text-destructive" : "ml-2 font-normal text-muted-foreground"}>
                          Day {start + 1}–{lastDay}
                          {overruns && " · ends after the school year"}
                        </span>
                      )}
                    </legend>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                      <Field label="Name" htmlFor={`${prefix}-name`} error={rowError(index, "name")} className="lg:col-span-2">
                        <Input
                          id={`${prefix}-name`}
                          value={row.name}
                          onChange={(event) => setRow(index, { name: event.target.value })}
                          required
                          maxLength={100}
                          placeholder="First term"
                        />
                      </Field>
                      <Field label="Short label" htmlFor={`${prefix}-label`} error={rowError(index, "label")}>
                        <Input
                          id={`${prefix}-label`}
                          value={row.label}
                          onChange={(event) => setRow(index, { label: event.target.value })}
                          maxLength={100}
                          placeholder="T1"
                        />
                      </Field>
                      <Field label="Type" htmlFor={`${prefix}-type`} error={rowError(index, "type")}>
                        <Select
                          id={`${prefix}-type`}
                          value={row.type}
                          onChange={(event) => setRow(index, { type: event.target.value as PeriodType })}
                        >
                          {PERIOD_TYPES.map((type) => (
                            <option key={type.value} value={type.value}>
                              {type.label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Starts after (days)" htmlFor={`${prefix}-start`} error={rowError(index, "startOffsetDays")}>
                        <Input
                          id={`${prefix}-start`}
                          type="number"
                          min={0}
                          max={TEMPLATE_LIMITS.cycleDays}
                          value={row.start}
                          onChange={(event) => setRow(index, { start: event.target.value })}
                          required
                        />
                      </Field>
                      <Field label="Length (days)" htmlFor={`${prefix}-length`} error={rowError(index, "lengthDays")}>
                        <Input
                          id={`${prefix}-length`}
                          type="number"
                          min={1}
                          max={TEMPLATE_LIMITS.cycleDays}
                          value={row.length}
                          onChange={(event) => setRow(index, { length: event.target.value })}
                          required
                        />
                      </Field>
                    </div>
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <Field label="Inside" htmlFor={`${prefix}-parent`} error={rowError(index, "parentIndex")} className="w-full max-w-xs">
                        <Select
                          id={`${prefix}-parent`}
                          value={row.parent ?? ""}
                          onChange={(event) => setRow(index, { parent: event.target.value ? Number(event.target.value) : null })}
                        >
                          <option value="">Nothing (top level)</option>
                          {draft.rows.slice(0, index).map((earlier, at) => (
                            <option key={earlier.key} value={at + 1}>
                              Row {at + 1}
                              {earlier.name ? `: ${earlier.name}` : ""}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      {!readOnly && (
                        <Button variant="ghost" size="sm" onClick={() => removeRow(index)} aria-label={`Remove row ${index + 1}`}>
                          <Trash2 /> Remove
                        </Button>
                      )}
                    </div>
                  </fieldset>
                </li>
              );
            })}
          </ol>
        </section>
      </fieldset>

      <FormError error={save.error} fields={shownFields} />

      <div className="flex flex-wrap gap-2">
        {!readOnly && (
          <Button type="submit" disabled={save.submitting || draft.rows.length === 0}>
            {save.submitting ? "Saving…" : template ? "Save template" : "Create template"}
          </Button>
        )}
        <ButtonLink href={listHref} variant="outline">
          {readOnly ? "Back" : "Cancel"}
        </ButtonLink>
      </div>
    </form>
  );
}

function ToggleRow({
  id,
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
      <div>
        <p id={id} className="text-sm font-medium">
          {label}
        </p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-labelledby={id} />
    </div>
  );
}
