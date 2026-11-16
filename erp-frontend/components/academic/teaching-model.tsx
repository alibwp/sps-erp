"use client";

import { Ban, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useWorkingContext } from "@/components/auth/session";
import { FormError, Loaded } from "@/components/ui/api-states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Select, Textarea } from "@/components/ui/form";
import { Alert, SectionHeading } from "@/components/ui/misc";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import type { Paginated } from "@/lib/api";
import {
  academicApi,
  INSTRUCTIONAL_MODELS,
  levelTree,
  modelLabel,
  ROSTER_MODES,
  rosterModeLabel,
  type InstructionalModel,
  type InstructionalModelState,
  type Level,
  type ModelException,
  type ModelMigration,
  type Subject,
  type YearDetail,
} from "@/lib/academic";
import { useApiMutation, useApiQuery } from "@/lib/use-api";
import { formatDate } from "@/lib/utils";

/**
 * How the campus teaches a year. Before the year starts the model is set
 * directly ("manage school settings"); once it runs it moves by a migration
 * with a reason ("migrate instructional model"). Exceptions let one subject
 * use a roster the model would refuse.
 */
export function TeachingModelPanel({ year }: { year: YearDetail }) {
  const path = `${academicApi.year(year.id)}/instructional-model`;
  const state = useApiQuery<InstructionalModelState>(path, { keepPrevious: true });

  return (
    <Loaded query={state}>
      {(data) => (
        <div className="grid gap-10">
          <ModelSection year={year} path={path} state={data} onChanged={state.reload} />
          {data.migrations.length > 0 && <Migrations migrations={data.migrations} />}
          <ExceptionsSection year={year} path={`${path}/exceptions`} state={data} />
        </div>
      )}
    </Loaded>
  );
}

function ModelSection({
  year,
  path,
  state,
  onChanged,
}: {
  year: YearDetail;
  path: string;
  state: InstructionalModelState;
  onChanged: () => void;
}) {
  const toast = useToast();
  const { can } = useWorkingContext();
  const save = useApiMutation();
  const [model, setModel] = useState<InstructionalModel>(state.model);
  const [reason, setReason] = useState("");

  const setDirectly = state.canSet && can("manage school settings");
  const migrate = !state.canSet && state.canMigrate && can("migrate instructional model");
  const editable = setDirectly || migrate;
  const changed = model !== state.model || (setDirectly && !state.chosen);
  const current = INSTRUCTIONAL_MODELS.find((item) => item.value === state.model);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sent = migrate
      ? await save.send<ModelMigration>(`${path}/migrations`, { method: "POST", body: { model, reason: reason.trim() } })
      : await save.send<InstructionalModelState>(path, { method: "PUT", body: { model, reason: reason.trim() || null } });
    if (!sent.ok) return;
    setReason("");
    onChanged();
    toast({
      title: migrate ? "Teaching model migrated" : "Teaching model saved",
      description: `${year.name} is taught as “${modelLabel(model)}”.`,
    });
  }

  return (
    <section className="grid gap-4" aria-labelledby="model-heading">
      <SectionHeading title="Teaching model" id="model-heading">
        {!state.chosen && <Badge tone="warning">Not chosen yet: the default applies</Badge>}
      </SectionHeading>
      <div className="grid gap-1">
        <p className="font-medium">{state.label}</p>
        {current && <p className="text-sm text-muted-foreground">{current.description}</p>}
        <p className="text-sm text-muted-foreground">
          Subjects can be taught to: {state.rosterModes.map(rosterModeLabel).join(", ").toLowerCase()}.
        </p>
      </div>

      {editable ? (
        <form onSubmit={submit} className="grid max-w-2xl gap-4">
          {migrate && (
            <Alert tone="warning" title="The year is running">
              Changing the model now is a migration: it needs a reason and records what it changes for the subjects being taught.
            </Alert>
          )}
          <Field label={migrate ? "Migrate to" : "Teaching model"} htmlFor="model" error={save.fieldErrors.model}>
            <Select
              id="model"
              value={model}
              onChange={(event) => {
                setModel(event.target.value as InstructionalModel);
                save.clear();
              }}
              disabled={save.submitting}
            >
              {INSTRUCTIONAL_MODELS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={migrate ? "Reason" : "Reason (optional)"} htmlFor="model-reason" error={save.fieldErrors.reason}>
            <Textarea
              id="model-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required={migrate}
              maxLength={migrate ? 2000 : 500}
              rows={2}
              disabled={save.submitting}
            />
          </Field>
          <FormError error={save.error} fields={["model", "reason"]} />
          <div>
            <Button type="submit" disabled={save.submitting || !changed}>
              {save.submitting ? "Saving…" : migrate ? "Migrate" : "Save"}
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">
          {state.canSet
            ? "Choosing the model needs the “manage school settings” permission."
            : state.canMigrate
              ? "Changing a running year's model needs the “migrate instructional model” permission."
              : "This year's model can no longer change."}
        </p>
      )}
    </section>
  );
}

function Migrations({ migrations }: { migrations: ModelMigration[] }) {
  return (
    <section className="grid gap-4" aria-labelledby="migrations-heading">
      <SectionHeading title="Migrations" id="migrations-heading" />
      <Table>
        <THead>
          <TH>Change</TH>
          <TH>Reason</TH>
          <TH>Impact</TH>
          <TH>When</TH>
        </THead>
        <tbody>
          {[...migrations]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map((migration) => (
              <TR key={migration.id}>
                <TD>
                  {modelLabel(migration.fromModel)} → {modelLabel(migration.toModel)}
                </TD>
                <TD className="max-w-80">{migration.reason}</TD>
                <TD className="text-xs text-muted-foreground">
                  {migration.impact
                    ? Object.entries(migration.impact)
                        .map(([key, value]) => `${key.replaceAll("_", " ")}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`)
                        .join(" · ")
                    : "—"}
                </TD>
                <TD className="whitespace-nowrap">{formatDate(migration.createdAt)}</TD>
              </TR>
            ))}
        </tbody>
      </Table>
    </section>
  );
}

function ExceptionsSection({ year, path, state }: { year: YearDetail; path: string; state: InstructionalModelState }) {
  const toast = useToast();
  const { can } = useWorkingContext();
  const exceptions = useApiQuery<ModelException[]>(path, { keepPrevious: true });
  const revoke = useApiMutation();
  const [granting, setGranting] = useState(false);
  const [revoking, setRevoking] = useState<ModelException | null>(null);
  const canManage = can("manage school settings");

  async function confirmRevoke(exception: ModelException) {
    const sent = await revoke.send(`${path}/${exception.id}/revoke`, { method: "POST" });
    if (!sent.ok) {
      toast({ title: "Could not revoke", description: sent.error.message, tone: "error" });
      return;
    }
    exceptions.reload();
    toast({ title: "Exception revoked", description: "Subjects already taught under it keep running." });
  }

  return (
    <section className="grid gap-4" aria-labelledby="exceptions-heading">
      <SectionHeading title="Exceptions" id="exceptions-heading">
        {canManage && (
          <Button variant="outline" size="sm" onClick={() => setGranting(true)}>
            <Plus /> Grant exception
          </Button>
        )}
      </SectionHeading>
      <p className="text-sm text-muted-foreground">Subjects allowed a roster the teaching model would otherwise refuse.</p>
      <Loaded query={exceptions}>
        {(data) =>
          data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No exceptions for {year.name}.</p>
          ) : (
            <Table busy={exceptions.loading}>
              <THead>
                <TH>Subject</TH>
                <TH>Class</TH>
                <TH>Roster</TH>
                <TH>Reason</TH>
                <TH>Status</TH>
                {canManage && (
                  <TH className="text-right">
                    <span className="sr-only">Actions</span>
                  </TH>
                )}
              </THead>
              <tbody>
                {data.map((exception) => (
                  <TR key={exception.id}>
                    <TD className="font-medium">{exception.subject.name}</TD>
                    <TD>{exception.academicLevel?.name ?? "Every class"}</TD>
                    <TD>{rosterModeLabel(exception.rosterMode)}</TD>
                    <TD className="max-w-72">
                      {exception.reason}
                      {exception.grantedBy && <span className="block text-xs text-muted-foreground">by {exception.grantedBy.name}</span>}
                    </TD>
                    <TD>
                      {exception.running ? <Badge tone="success">Running</Badge> : <Badge>Revoked {formatDate(exception.revokedAt)}</Badge>}
                    </TD>
                    {canManage && (
                      <TD className="py-2 text-right">
                        {exception.running && (
                          <Button variant="ghost" size="sm" onClick={() => setRevoking(exception)} disabled={revoke.submitting}>
                            <Ban /> Revoke
                          </Button>
                        )}
                      </TD>
                    )}
                  </TR>
                ))}
              </tbody>
            </Table>
          )
        }
      </Loaded>

      {granting && <GrantDialog path={path} state={state} onClose={() => setGranting(false)} onSaved={exceptions.reload} />}
      <ConfirmDialog
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        onConfirm={() => {
          if (revoking) void confirmRevoke(revoking);
        }}
        title={`Revoke the exception for ${revoking?.subject.name ?? "this subject"}?`}
        description="No new offering can use it. Offerings already made under it keep running."
        confirmLabel="Revoke"
      />
    </section>
  );
}

/** POST …/exceptions: one subject, optionally one class, a roster the model refuses, and a reason. */
function GrantDialog({
  path,
  state,
  onClose,
  onSaved,
}: {
  path: string;
  state: InstructionalModelState;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const save = useApiMutation();
  const subjects = useApiQuery<Paginated<Subject>>(`${academicApi.subjects}?perPage=100`);
  const levels = useApiQuery<Level[]>(`${academicApi.levels}?status=active`);
  // The modes this model already allows need no exception.
  const modes = ROSTER_MODES.filter((mode) => !state.rosterModes.includes(mode.value));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const sent = await save.send<ModelException>(path, {
      method: "POST",
      body: {
        subjectId: String(form.get("subjectId")),
        rosterMode: String(form.get("rosterMode")),
        academicLevelId: String(form.get("academicLevelId") ?? "") || null,
        reason: String(form.get("reason") ?? "").trim(),
      },
    });
    if (!sent.ok) return;
    onSaved();
    onClose();
    toast({ title: "Exception granted", description: sent.data.subject.name });
  }

  return (
    <Dialog open onClose={onClose} title="Grant an exception" className="max-h-[90vh] max-w-xl overflow-y-auto">
      {modes.length === 0 ? (
        <p className="text-sm text-muted-foreground">This teaching model already allows every roster, so no exception is needed.</p>
      ) : (
        <form onSubmit={submit} onChange={save.clear} className="grid gap-4">
          <fieldset disabled={save.submitting} className="grid gap-4">
            <legend className="sr-only">Exception</legend>
            <Field label="Subject" htmlFor="exception-subject" error={save.fieldErrors.subjectId}>
              <Select id="exception-subject" name="subjectId" required defaultValue="">
                <option value="" disabled>
                  {subjects.data ? "Choose a subject" : "Loading subjects…"}
                </option>
                {subjects.data?.data.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Class" htmlFor="exception-level" error={save.fieldErrors.academicLevelId}>
              <Select id="exception-level" name="academicLevelId" defaultValue="">
                <option value="">Every class</option>
                {levelTree(levels.data ?? [])
                  .filter(({ level }) => !level.isGroup)
                  .map(({ level, depth }) => (
                    <option key={level.id} value={level.id}>
                      {"— ".repeat(depth)}
                      {level.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Roster" htmlFor="exception-roster" error={save.fieldErrors.rosterMode}>
              <Select id="exception-roster" name="rosterMode" required defaultValue={modes[0].value}>
                {modes.map((mode) => (
                  <option key={mode.value} value={mode.value}>
                    {mode.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Reason" htmlFor="exception-reason" error={save.fieldErrors.reason}>
              <Textarea id="exception-reason" name="reason" required maxLength={2000} rows={3} />
            </Field>
          </fieldset>
          <FormError error={save.error ?? subjects.error ?? levels.error} fields={["subjectId", "academicLevelId", "rosterMode", "reason"]} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={onClose} disabled={save.submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.submitting}>
              {save.submitting ? "Granting…" : "Grant"}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
