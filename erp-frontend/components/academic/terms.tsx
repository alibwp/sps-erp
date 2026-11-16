"use client";

import { CalendarClock, CalendarRange, Ellipsis, History, Pencil, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { refreshContext, useWorkingContext } from "@/components/auth/session";
import { DatesDialog, HistoryPanel, StatusBadge, StatusDialog, useStatusMoves } from "@/components/academic/status-dialogs";
import { FormError } from "@/components/ui/api-states";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Field, Input, Select } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/misc";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import {
  academicApi,
  CHILD_TYPES,
  isFrozen,
  periodTypeLabel,
  TOP_LEVEL_TYPES,
  type Period,
  type YearDetail,
} from "@/lib/academic";
import { useApiMutation } from "@/lib/use-api";
import { formatDate } from "@/lib/utils";

type Dialogs =
  | { kind: "add" }
  | { kind: "edit" | "dates" | "status" | "delete" | "history"; period: Period }
  | null;

/**
 * The year's periods: top-level terms with the exam windows, holidays and
 * reporting periods inside them. Each action shows only when the period's
 * status and the person's permissions allow it.
 */
export function TermsPanel({ year, onChanged }: { year: YearDetail; onChanged: () => void }) {
  const toast = useToast();
  const { can } = useWorkingContext();
  const removal = useApiMutation();
  const [dialog, setDialog] = useState<Dialogs>(null);

  const canAdd = can("create academic period") && !isFrozen(year.status);
  const rows = year.periods.flatMap((term) => [
    { period: term, child: false },
    ...term.children.map((child) => ({ period: child, child: true })),
  ]);

  // A term change can move the working term in the period bar too.
  const changed = () => {
    onChanged();
    void refreshContext().catch(() => undefined);
  };

  async function remove(period: Period) {
    const sent = await removal.send(academicApi.period(period.id), { method: "DELETE" });
    if (!sent.ok) {
      toast({ title: "Could not delete", description: sent.error.message, tone: "error" });
      return;
    }
    changed();
    toast({ title: `${period.displayName} deleted` });
  }

  return (
    <div className="grid gap-4">
      {canAdd && (
        <div className="flex justify-end">
          <Button onClick={() => setDialog({ kind: "add" })}>
            <Plus /> Add period
          </Button>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState icon={CalendarRange} title="No terms yet" />
      ) : (
        <Table>
          <THead>
            <TH>Period</TH>
            <TH>Type</TH>
            <TH>Starts</TH>
            <TH>Ends</TH>
            <TH>Status</TH>
            <TH className="text-right">
              <span className="sr-only">Actions</span>
            </TH>
          </THead>
          <tbody>
            {rows.map(({ period, child }) => (
              <TR key={period.id}>
                <TD className={child ? "pl-10" : undefined}>
                  <span className={child ? "text-sm" : "font-medium"}>{period.displayName}</span>
                  {period.label && <span className="block text-xs text-muted-foreground">{period.name}</span>}
                </TD>
                <TD>{periodTypeLabel(period.type)}</TD>
                <TD className="whitespace-nowrap">{formatDate(period.startsOn)}</TD>
                <TD className="whitespace-nowrap">{formatDate(period.endsOn)}</TD>
                <TD>
                  <StatusBadge status={period.status} />
                </TD>
                <TD className="py-2 text-right">
                  <PeriodActions period={period} onPick={(kind) => setDialog({ kind, period })} />
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}

      {dialog?.kind === "add" && <PeriodDialog year={year} onClose={() => setDialog(null)} onSaved={changed} />}
      {dialog?.kind === "edit" && (
        <PeriodDialog year={year} period={dialog.period} onClose={() => setDialog(null)} onSaved={changed} />
      )}
      {dialog?.kind === "dates" && (
        <DatesDialog
          target={{ kind: "period", path: academicApi.period(dialog.period.id), name: dialog.period.displayName, status: dialog.period.status }}
          startsOn={dialog.period.startsOn}
          endsOn={dialog.period.endsOn}
          onClose={() => setDialog(null)}
          onDone={changed}
        />
      )}
      {dialog?.kind === "status" && (
        <StatusDialog
          target={{ kind: "period", path: academicApi.period(dialog.period.id), name: dialog.period.displayName, status: dialog.period.status }}
          onClose={() => setDialog(null)}
          onDone={changed}
        />
      )}
      {dialog?.kind === "history" && (
        <Dialog open onClose={() => setDialog(null)} title={`History of ${dialog.period.displayName}`} className="max-w-2xl">
          <HistoryPanel path={academicApi.period(dialog.period.id)} />
        </Dialog>
      )}
      <ConfirmDialog
        open={dialog?.kind === "delete"}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          if (dialog?.kind === "delete") void remove(dialog.period);
        }}
        title={`Delete ${dialog && dialog.kind !== "add" ? dialog.period.displayName : "this period"}?`}
        description="Only a draft that never changed status can be deleted. Archive the others."
        confirmLabel="Delete"
      />
    </div>
  );
}

function PeriodActions({ period, onPick }: { period: Period; onPick: (kind: "edit" | "dates" | "status" | "delete" | "history") => void }) {
  const { can } = useWorkingContext();
  const moves = useStatusMoves("period", period.status);
  const canUpdate = can("update academic period") && !isFrozen(period.status);
  const canDelete = can("delete academic period") && period.status === "draft";

  return (
    <DropdownMenu trigger={<Ellipsis className="size-4" />} triggerLabel={`Actions for ${period.displayName}`} triggerClassName="size-9" className="w-52">
      {canUpdate && (
        <DropdownMenuItem onClick={() => onPick("edit")}>
          <Pencil /> Edit
        </DropdownMenuItem>
      )}
      {canUpdate && (
        <DropdownMenuItem onClick={() => onPick("dates")}>
          <CalendarClock /> Change dates
        </DropdownMenuItem>
      )}
      {moves.length > 0 && (
        <DropdownMenuItem onClick={() => onPick("status")}>
          <History /> Change status
        </DropdownMenuItem>
      )}
      <DropdownMenuItem onClick={() => onPick("history")}>
        <History /> Status history
      </DropdownMenuItem>
      {canDelete && (
        <DropdownMenuItem destructive onClick={() => onPick("delete")}>
          <Trash2 /> Delete
        </DropdownMenuItem>
      )}
    </DropdownMenu>
  );
}

/**
 * Add: POST /v1/academic-years/:id/periods. A term sits at the top; an exam
 * window, holiday or reporting period sits inside a term.
 * Edit: PATCH /v1/academic-periods/:id (name, label, type, position; dates
 * have their own dialog).
 */
function PeriodDialog({
  year,
  period,
  onClose,
  onSaved,
}: {
  year: YearDetail;
  period?: Period;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const save = useApiMutation();
  const editing = period !== undefined;
  const [type, setType] = useState<string>(period?.type ?? "term");
  const inside = (CHILD_TYPES as readonly string[]).includes(type);
  // An edit keeps the period at its level: a term stays top-level, a child stays inside.
  const typeChoices = editing
    ? period.parentId
      ? CHILD_TYPES
      : TOP_LEVEL_TYPES
    : [...TOP_LEVEL_TYPES, ...CHILD_TYPES];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "").trim();
    const position = text("position");

    if (period) {
      const body: Record<string, string | number | null> = {};
      if (text("name") !== period.name) body.name = text("name");
      if (text("label") !== (period.label ?? "")) body.label = text("label") || null;
      if (type !== period.type) body.type = type;
      if (position && Number(position) !== period.position) body.position = Number(position);
      if (Object.keys(body).length === 0) {
        onClose();
        return;
      }
      const sent = await save.send<Period>(academicApi.period(period.id), { method: "PATCH", body });
      if (!sent.ok) return;
      toast({ title: "Period saved", description: sent.data.displayName });
    } else {
      const sent = await save.send<Period>(`${academicApi.year(year.id)}/periods`, {
        method: "POST",
        body: {
          name: text("name"),
          label: text("label") || null,
          type,
          startsOn: text("startsOn"),
          endsOn: text("endsOn"),
          ...(inside ? { parentId: text("parentId") } : {}),
          ...(position ? { position: Number(position) } : {}),
        },
      });
      if (!sent.ok) return;
      toast({ title: "Period added", description: sent.data.displayName });
    }
    onSaved();
    onClose();
  }

  const errors = save.fieldErrors;

  return (
    <Dialog
      open
      onClose={onClose}
      title={editing ? `Edit ${period.displayName}` : `Add a period to ${year.name}`}
      description={editing ? "Dates change from “Change dates”." : "In a published year it takes its status from its dates."}
      className="max-h-[90vh] max-w-xl overflow-y-auto"
    >
      <form onSubmit={submit} onChange={save.clear} className="grid gap-4">
        <fieldset disabled={save.submitting} className="grid gap-4 sm:grid-cols-2">
          <legend className="sr-only">Period</legend>
          <Field label="Type" htmlFor="period-type" error={errors.type}>
            <Select id="period-type" value={type} onChange={(event) => setType(event.target.value)}>
              {typeChoices.map((value) => (
                <option key={value} value={value}>
                  {periodTypeLabel(value)}
                </option>
              ))}
            </Select>
          </Field>
          {!editing && inside ? (
            <Field label="Inside" htmlFor="period-parent" error={errors.parentId}>
              <Select id="period-parent" name="parentId" required defaultValue="">
                <option value="" disabled>
                  Choose a term
                </option>
                {year.periods.map((term) => (
                  <option key={term.id} value={term.id}>
                    {term.displayName}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <div className="hidden sm:block" />
          )}
          <Field label="Name" htmlFor="period-name" error={errors.name}>
            <Input id="period-name" name="name" defaultValue={period?.name} required maxLength={100} placeholder="Mid-term exams" />
          </Field>
          <Field label="Short label" htmlFor="period-label" error={errors.label} help="Shown instead of the name where space is short.">
            <Input id="period-label" name="label" defaultValue={period?.label ?? ""} maxLength={100} />
          </Field>
          {!editing && (
            <>
              <Field label="Starts" htmlFor="period-start" error={errors.startsOn}>
                <Input id="period-start" name="startsOn" type="date" min={year.startsOn ?? undefined} max={year.endsOn ?? undefined} required />
              </Field>
              <Field label="Ends" htmlFor="period-end" error={errors.endsOn}>
                <Input id="period-end" name="endsOn" type="date" min={year.startsOn ?? undefined} max={year.endsOn ?? undefined} required />
              </Field>
            </>
          )}
          <Field label="Position" htmlFor="period-position" error={errors.position} help="Order among its neighbours (1–99). Optional.">
            <Input id="period-position" name="position" type="number" min={1} max={99} defaultValue={period?.position} />
          </Field>
        </fieldset>
        <FormError error={save.error} fields={["type", "parentId", "name", "label", "startsOn", "endsOn", "position"]} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={save.submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.submitting}>
            {save.submitting ? "Saving…" : editing ? "Save" : "Add period"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
