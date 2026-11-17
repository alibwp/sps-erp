"use client";

import { CircleAlert, CircleCheck, History } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useWorkingContext } from "@/components/auth/session";
import { FormError, Loaded } from "@/components/ui/api-states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/misc";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import {
  ACADEMIC_NEXT,
  ACADEMIC_STATUS_LABELS,
  isClosingMove,
  reasonNeededFor,
  statusPermission,
  statusTone,
  STRUCTURE_STATUS_LABELS,
  type AcademicStatus,
  type ClosureReadiness,
  type StatusHistory,
  type StructureStatus,
} from "@/lib/academic";
import { useApiMutation, useApiQuery } from "@/lib/use-api";

/** A status as a coloured badge. */
export function StatusBadge({ status }: { status: string }) {
  const label =
    ACADEMIC_STATUS_LABELS[status as AcademicStatus] ?? STRUCTURE_STATUS_LABELS[status as StructureStatus] ?? status;
  return <Badge tone={statusTone(status)}>{label}</Badge>;
}

type Target = {
  kind: "year" | "period";
  /** e.g. /v1/academic-years/:id */
  path: string;
  name: string;
  status: AcademicStatus;
};

/** The moves this person may make from `status`. */
export function useStatusMoves(kind: Target["kind"], status: AcademicStatus): AcademicStatus[] {
  const { can } = useWorkingContext();
  return ACADEMIC_NEXT[status].filter((to) => can(statusPermission(status, to, kind)));
}

/**
 * POST …/status-changes for a year or a period. Closing moves show the
 * closure-readiness findings first; blocking findings refuse the close unless
 * the person forces it. Leaving closed or archived needs a reason.
 */
export function StatusDialog({ target, onClose, onDone }: { target: Target; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const moves = useStatusMoves(target.kind, target.status);
  const save = useApiMutation();
  const [to, setTo] = useState<AcademicStatus | "">(moves[0] ?? "");
  const [reason, setReason] = useState("");
  const [force, setForce] = useState(false);

  const closing = to !== "" && isClosingMove(to);
  const readiness = useApiQuery<ClosureReadiness>(closing ? `${target.path}/closure-readiness` : null);
  const blocked = closing && readiness.data !== undefined && !readiness.data.ready;
  const needsReason = to !== "" && reasonNeededFor(target.status, to);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (to === "") return;
    const sent = await save.send(`${target.path}/status-changes`, {
      method: "POST",
      body: { to, reason: reason.trim() || null, force: blocked ? force : undefined },
    });
    if (!sent.ok) return;
    onDone();
    onClose();
    toast({ title: `${target.name} is now ${ACADEMIC_STATUS_LABELS[to].toLowerCase()}` });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Change the status of ${target.name}`}
      description={
        target.kind === "year"
          ? "Closing or archiving a year takes its periods along."
          : "Closing a period closes the periods inside it."
      }
      className="max-h-[90vh] max-w-xl overflow-y-auto"
    >
      {moves.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {target.status === "archived" ? "An archived record cannot change status." : "You cannot change this status."}
        </p>
      ) : (
        <form onSubmit={submit} className="grid gap-4">
          <div className="flex items-center gap-2 text-sm">
            Now <StatusBadge status={target.status} />
          </div>
          <Field label="Move to" htmlFor="status-to" error={save.fieldErrors.to}>
            <Select
              id="status-to"
              value={to}
              onChange={(event) => {
                setTo(event.target.value as AcademicStatus);
                setForce(false);
                save.clear();
              }}
              disabled={save.submitting}
            >
              {moves.map((move) => (
                <option key={move} value={move}>
                  {ACADEMIC_STATUS_LABELS[move]}
                </option>
              ))}
            </Select>
          </Field>

          {closing && (
            <Loaded query={readiness}>
              {(data) => (
                <div className="grid gap-2 rounded-lg border p-4">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {data.ready ? (
                      <CircleCheck className="size-4 text-success" aria-hidden />
                    ) : (
                      <CircleAlert className="size-4 text-destructive" aria-hidden />
                    )}
                    {data.ready ? "Ready to close" : "Not ready to close"}
                  </p>
                  {data.findings.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nothing is left behind.</p>
                  ) : (
                    <ul className="grid gap-1.5 text-sm">
                      {data.findings.map((finding) => (
                        <li key={finding.key} className="flex items-start justify-between gap-3">
                          <span>{finding.summary}</span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="tabular-nums text-muted-foreground">{finding.count}</span>
                            {finding.blocking && <Badge tone="danger">Blocks</Badge>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {blocked && (
                    <label className="mt-2 flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4"
                        checked={force}
                        onChange={(event) => setForce(event.target.checked)}
                      />
                      Close anyway. The findings above are recorded with the change.
                    </label>
                  )}
                </div>
              )}
            </Loaded>
          )}

          {(needsReason || to === "open" || closing) && (
            <Field
              label={needsReason ? "Reason" : "Reason (optional)"}
              htmlFor="status-reason"
              error={save.fieldErrors.reason}
              help={needsReason ? "Reopening something closed is recorded with its reason." : undefined}
            >
              <Textarea
                id="status-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                required={needsReason}
                maxLength={500}
                rows={2}
                disabled={save.submitting}
              />
            </Field>
          )}

          <FormError error={save.error} fields={["to", "reason"]} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={onClose} disabled={save.submitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={closing ? "destructive" : "default"}
              disabled={save.submitting || to === "" || (closing && readiness.data === undefined) || (blocked && !force)}
            >
              {save.submitting ? "Saving…" : to ? `Move to ${ACADEMIC_STATUS_LABELS[to].toLowerCase()}` : "Save"}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

/** GET …/status-changes of a year or a period, newest first. */
export function HistoryPanel({ path }: { path: string }) {
  const history = useApiQuery<StatusHistory[]>(`${path}/status-changes`, { keepPrevious: true });
  return (
    <Loaded query={history}>
      {(data) =>
        data.length === 0 ? (
          <EmptyState icon={History} title="No status changes yet" />
        ) : (
          <Table busy={history.loading}>
            <THead>
              <TH>Change</TH>
              <TH>Reason</TH>
              <TH>When</TH>
            </THead>
            <tbody>
              {[...data]
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .map((entry) => (
                  <TR key={entry.id}>
                    <TD>
                      <span className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={entry.fromStatus} /> → <StatusBadge status={entry.toStatus} />
                      </span>
                    </TD>
                    <TD className="max-w-96">{entry.reason ?? <span className="text-muted-foreground">—</span>}</TD>
                    <TD className="whitespace-nowrap">{new Date(entry.createdAt).toLocaleString()}</TD>
                  </TR>
                ))}
            </tbody>
          </Table>
        )
      }
    </Loaded>
  );
}

/**
 * PUT …/dates. A running record (open or closing) needs a reason; the
 * backend also checks that periods still fit and years do not overlap.
 */
export function DatesDialog({
  target,
  startsOn,
  endsOn,
  onClose,
  onDone,
}: {
  target: Target;
  startsOn: string | null;
  endsOn: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const save = useApiMutation();
  const running = target.status === "open" || target.status === "closing";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const sent = await save.send(`${target.path}/dates`, {
      method: "PUT",
      body: {
        startsOn: String(form.get("startsOn")),
        endsOn: String(form.get("endsOn")),
        reason: String(form.get("reason") ?? "").trim() || null,
      },
    });
    if (!sent.ok) return;
    onDone();
    onClose();
    toast({ title: "Dates changed", description: target.name });
  }

  return (
    <Dialog open onClose={onClose} title={`Dates of ${target.name}`}>
      <form onSubmit={submit} onChange={save.clear} className="grid gap-4">
        <fieldset disabled={save.submitting} className="grid gap-4 sm:grid-cols-2">
          <legend className="sr-only">Dates</legend>
          <Field label="Starts" htmlFor="dates-start" error={save.fieldErrors.startsOn}>
            <Input id="dates-start" name="startsOn" type="date" defaultValue={startsOn ?? ""} required />
          </Field>
          <Field label="Ends" htmlFor="dates-end" error={save.fieldErrors.endsOn}>
            <Input id="dates-end" name="endsOn" type="date" defaultValue={endsOn ?? ""} required />
          </Field>
          {running && (
            <Field
              label="Reason"
              htmlFor="dates-reason"
              error={save.fieldErrors.reason}
              help="It is running, so the change is recorded with a reason."
              className="sm:col-span-2"
            >
              <Textarea id="dates-reason" name="reason" required maxLength={500} rows={2} />
            </Field>
          )}
        </fieldset>
        <FormError error={save.error} fields={["startsOn", "endsOn", "reason"]} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={save.submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.submitting}>
            {save.submitting ? "Saving…" : "Save dates"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
