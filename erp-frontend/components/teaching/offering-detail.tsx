"use client";

import { Archive, CircleCheck, Pencil, UserMinus, UserPlus, Users } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useWorkingContext } from "@/components/auth/session";
import { useLevels, useSections, useTeachers, useYearDetail } from "@/components/academic/lookups";
import { StatusBadge } from "@/components/academic/status-dialogs";
import { rosterSummary } from "@/components/teaching/offerings";
import { RosterPicker, rosterBody, rosterProblem, type RosterValue } from "@/components/teaching/roster-picker";
import { Page } from "@/components/layout/page-header";
import { FormError, Loaded, LookupError } from "@/components/ui/api-states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert, EmptyState } from "@/components/ui/misc";
import { Tabs } from "@/components/ui/tabs";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { academicApi, isFrozen, rosterModeLabel, STRUCTURE_NEXT, type InstructionalModelState } from "@/lib/academic";
import { TEACHING_ROLES, teachingApi, type Assignment, type Offering, type Roster } from "@/lib/teaching";
import { useApiMutation, useApiQuery } from "@/lib/use-api";
import { formatDate } from "@/lib/utils";

type Dialogs = "rename" | "archive" | null;

/** /course-offerings/[id]: one subject taught to one class for a term. */
export function OfferingDetail({ id }: { id: string }) {
  const offering = useApiQuery<Offering>(teachingApi.offering(id), { keepPrevious: true });
  const title = offering.data ? `${offering.data.subject.name}${offering.data.name ? ` · ${offering.data.name}` : ""}` : "Offering";

  return (
    <Page
      title={
        <span className="flex flex-wrap items-center gap-3">
          {title}
          {offering.data && <StatusBadge status={offering.data.status} />}
        </span>
      }
      breadcrumbs={[{ label: "Subjects being taught", href: "/course-offerings" }, { label: title }]}
      actions={offering.data && <OfferingActions offering={offering.data} onChanged={offering.reload} />}
    >
      <Loaded query={offering}>{(data) => <OfferingBody offering={data} onChanged={offering.reload} />}</Loaded>
    </Page>
  );
}

function OfferingActions({ offering, onChanged }: { offering: Offering; onChanged: () => void }) {
  const toast = useToast();
  const { can } = useWorkingContext();
  const action = useApiMutation();
  const [dialog, setDialog] = useState<Dialogs>(null);
  if (!can("update subject") || offering.status === "archived") return null;

  async function setStatus(status: "active" | "archived") {
    const sent = await action.send<Offering>(`${teachingApi.offering(offering.id)}/status`, { method: "POST", body: { status } });
    if (!sent.ok) {
      toast({ title: status === "active" ? "Could not activate" : "Could not archive", description: sent.error.message, tone: "error" });
      return;
    }
    onChanged();
    toast({ title: status === "active" ? "Offering activated" : "Offering archived" });
  }

  return (
    <>
      <Button variant="outline" onClick={() => setDialog("rename")}>
        <Pencil /> Rename
      </Button>
      {STRUCTURE_NEXT[offering.status].includes("active") && (
        <Button onClick={() => void setStatus("active")} disabled={action.submitting}>
          <CircleCheck /> Activate
        </Button>
      )}
      {STRUCTURE_NEXT[offering.status].includes("archived") && (
        <Button variant="outline" onClick={() => setDialog("archive")} disabled={action.submitting}>
          <Archive /> Archive
        </Button>
      )}
      {dialog === "rename" && <RenameDialog offering={offering} onClose={() => setDialog(null)} onSaved={onChanged} />}
      <ConfirmDialog
        open={dialog === "archive"}
        onClose={() => setDialog(null)}
        onConfirm={() => void setStatus("archived")}
        title={`Archive ${offering.subject.name}?`}
        description="An archived offering never changes again. Its records are kept."
        confirmLabel="Archive"
      />
    </>
  );
}

/** PATCH /v1/course-offerings/:id: a name of its own, or none. */
function RenameDialog({ offering, onClose, onSaved }: { offering: Offering; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const save = useApiMutation();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") ?? "").trim() || null;
    const sent = await save.send<Offering>(teachingApi.offering(offering.id), { method: "PATCH", body: { name } });
    if (!sent.ok) return;
    onSaved();
    onClose();
    toast({ title: name ? "Offering renamed" : "Name removed" });
  }

  return (
    <Dialog open onClose={onClose} title={`Name of ${offering.subject.name}`} description="Tells two offerings of one subject apart, e.g. “Algebra A”. Leave blank for none.">
      <form onSubmit={submit} onChange={save.clear} className="grid gap-4">
        <Field label="Name" htmlFor="offering-rename" error={save.fieldErrors.name}>
          <Input id="offering-rename" name="name" defaultValue={offering.name ?? ""} maxLength={100} autoFocus disabled={save.submitting} />
        </Field>
        <FormError error={save.error} fields={["name"]} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={save.submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.submitting}>
            {save.submitting ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function OfferingBody({ offering, onChanged }: { offering: Offering; onChanged: () => void }) {
  const levels = useLevels();
  const { query: yearQuery, year } = useYearDetail(offering.academicYearId);
  const { query: sectionsQuery, name: sectionName } = useSections(offering.academicYearId);
  const period = year?.periods.find((item) => item.id === offering.academicPeriodId);

  const facts: Array<[string, string]> = [
    ["Class", levels.name.get(offering.academicLevelId) ?? "—"],
    ["School year", year?.name ?? "—"],
    ["Term", period?.displayName ?? "—"],
    ["Roster", rosterSummary(offering, sectionName)],
    ["Periods per week", offering.plannedPeriodsPerWeek?.toString() ?? "—"],
    ["Capacity", offering.capacity?.toString() ?? "—"],
  ];

  return (
    <div className="grid gap-8">
      <LookupError queries={[levels.query, yearQuery, sectionsQuery]} />
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
        {facts.map(([label, value]) => (
          <div key={label} className="grid gap-1">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="text-sm font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <Tabs
        tabs={[
          { label: "Roster", content: <RosterPanel offering={offering} frozen={Boolean(period && isFrozen(period.status))} onChanged={onChanged} /> },
          { label: "Teachers", content: <TeachersPanel offering={offering} /> },
        ]}
      />
    </div>
  );
}

// ---------------------------------------------------------------- 7.2 Roster

/** GET …/roster?date=, and PUT …/roster to change who it teaches. */
function RosterPanel({ offering, frozen, onChanged }: { offering: Offering; frozen: boolean; onChanged: () => void }) {
  const { can } = useWorkingContext();
  const [date, setDate] = useState("");
  const [editing, setEditing] = useState(false);
  // Without a date the backend answers for the campus's today.
  const roster = useApiQuery<Roster>(`${teachingApi.offering(offering.id)}/roster${date ? `?date=${date}` : ""}`, { keepPrevious: true });
  const { name: sectionName } = useSections(offering.academicYearId);
  const canEdit = can("update subject") && offering.status !== "archived" && !frozen;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field label="On the day" htmlFor="roster-date" help="Learners move between sections; the roster follows them." className="w-56">
          <Input id="roster-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </Field>
        {canEdit && (
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil /> Change roster
          </Button>
        )}
      </div>
      {frozen && <p className="text-sm text-muted-foreground">The term is closed, so the roster can no longer change.</p>}
      <Loaded query={roster}>
        {(data) => (
          <div className="grid gap-4">
            <p className="text-sm">
              <span className="font-medium">{rosterModeLabel(data.rosterMode)}</span>
              {data.sections.length > 0 && <span className="text-muted-foreground"> · {data.sections.map((section) => section.name).join(", ")}</span>}
              <span className="text-muted-foreground"> · {data.learners.length} learners on {formatDate(data.date)}</span>
            </p>
            {data.limitedToSections && (
              <Alert tone="default">You teach part of this offering, so you see only your sections.</Alert>
            )}
            {data.learners.length === 0 ? (
              <EmptyState icon={Users} title="No learners on this day" />
            ) : (
              <Table busy={roster.loading}>
                <THead>
                  <TH>Learner</TH>
                  <TH>Admission no.</TH>
                  <TH>Section</TH>
                </THead>
                <tbody>
                  {[...data.learners]
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((learner) => (
                      <TR key={learner.studentRecordId}>
                        <TD className="font-medium">{learner.name}</TD>
                        <TD className="font-mono text-xs">{learner.admissionNumber}</TD>
                        <TD>{sectionName.get(learner.academicCycleSectionId) ?? "—"}</TD>
                      </TR>
                    ))}
                </tbody>
              </Table>
            )}
          </div>
        )}
      </Loaded>
      {editing && (
        <RosterDialog
          offering={offering}
          onClose={() => setEditing(false)}
          onSaved={() => {
            onChanged();
            roster.reload();
          }}
        />
      )}
    </div>
  );
}

function RosterDialog({ offering, onClose, onSaved }: { offering: Offering; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const save = useApiMutation();
  const [value, setValue] = useState<RosterValue>({
    mode: offering.rosterMode,
    sectionIds: offering.academicCycleSectionIds,
    studentIds: offering.studentRecordIds,
  });
  const [problem, setProblem] = useState<string | null>(null);
  const model = useApiQuery<InstructionalModelState>(`${academicApi.year(offering.academicYearId)}/instructional-model`);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const issue = rosterProblem(value);
    setProblem(issue);
    if (issue) return;
    const sent = await save.send<Offering>(`${teachingApi.offering(offering.id)}/roster`, { method: "PUT", body: rosterBody(value) });
    if (!sent.ok) return;
    onSaved();
    onClose();
    toast({ title: "Roster changed" });
  }

  return (
    <Dialog open onClose={onClose} title={`Who ${offering.subject.name} teaches`} className="max-h-[90vh] max-w-2xl overflow-y-auto">
      <form onSubmit={submit} className="grid gap-4">
        <fieldset disabled={save.submitting}>
          <legend className="sr-only">Roster</legend>
          <RosterPicker
            yearId={offering.academicYearId}
            levelId={offering.academicLevelId}
            value={value}
            onChange={(next) => {
              setValue(next);
              setProblem(null);
              save.clear();
            }}
            allowedModes={model.data?.rosterModes}
            errors={save.fieldErrors}
            idPrefix="edit-roster"
          />
        </fieldset>
        {problem && <Alert tone="destructive">{problem}</Alert>}
        <FormError error={save.error} fields={["rosterMode", "academicCycleSectionIds", "studentRecordIds"]} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={save.submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.submitting}>
            {save.submitting ? "Saving…" : "Save roster"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------- 7.3 Teachers

/** GET/POST …/teaching-assignments, and POST /v1/teaching-assignments/:id/end. */
function TeachersPanel({ offering }: { offering: Offering }) {
  const toast = useToast();
  const { can } = useWorkingContext();
  const assignments = useApiQuery<Assignment[]>(`${teachingApi.offering(offering.id)}/teaching-assignments`, { keepPrevious: true });
  const [assigning, setAssigning] = useState(false);
  const [ending, setEnding] = useState<Assignment | null>(null);
  const canEdit = can("update subject") && offering.status !== "archived";

  const sorted = useMemo(
    () => [...(assignments.data ?? [])].sort((a, b) => Number(b.running) - Number(a.running) || b.startsOn.localeCompare(a.startsOn)),
    [assignments.data],
  );

  return (
    <div className="grid gap-4">
      {canEdit && (
        <div className="flex justify-end">
          <Button onClick={() => setAssigning(true)}>
            <UserPlus /> Assign teacher
          </Button>
        </div>
      )}
      <Loaded query={assignments}>
        {() =>
          sorted.length === 0 ? (
            <EmptyState icon={Users} title="No teacher yet" description="Assign the lead teacher, and supporting teachers if any." />
          ) : (
            <Table busy={assignments.loading}>
              <THead>
                <TH>Teacher</TH>
                <TH>Role</TH>
                <TH>Section</TH>
                <TH>From</TH>
                <TH>Until</TH>
                <TH>Status</TH>
                {canEdit && (
                  <TH className="text-right">
                    <span className="sr-only">Actions</span>
                  </TH>
                )}
              </THead>
              <tbody>
                {sorted.map((assignment) => (
                  <TR key={assignment.id}>
                    <TD className="font-medium">{assignment.teacher.name}</TD>
                    <TD>{TEACHING_ROLES.find((role) => role.value === assignment.role)?.label ?? assignment.role}</TD>
                    <TD>{assignment.section?.name ?? "Whole offering"}</TD>
                    <TD className="whitespace-nowrap">{formatDate(assignment.startsOn)}</TD>
                    <TD className="whitespace-nowrap">{formatDate(assignment.endsOn)}</TD>
                    <TD>{assignment.running ? <Badge tone="success">Teaching</Badge> : <Badge>Ended</Badge>}</TD>
                    {canEdit && (
                      <TD className="py-2 text-right">
                        {assignment.running && (
                          <Button variant="ghost" size="sm" onClick={() => setEnding(assignment)}>
                            <UserMinus /> End
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
      {assigning && <AssignDialog offering={offering} onClose={() => setAssigning(false)} onSaved={assignments.reload} />}
      {ending && (
        <EndDialog
          assignment={ending}
          onClose={() => setEnding(null)}
          onSaved={() => {
            assignments.reload();
            toast({ title: `${ending.teacher.name}'s assignment ended` });
          }}
        />
      )}
    </div>
  );
}

function AssignDialog({ offering, onClose, onSaved }: { offering: Offering; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const save = useApiMutation();
  const { allowed, query, teachers } = useTeachers();
  const { name: sectionName } = useSections(offering.academicYearId);
  // A teacher can take one section of a multi-section offering.
  const sections = offering.academicCycleSectionIds;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const startsOn = String(form.get("startsOn") ?? "");
    const sent = await save.send<Assignment>(`${teachingApi.offering(offering.id)}/teaching-assignments`, {
      method: "POST",
      body: {
        userId: String(form.get("userId")),
        role: String(form.get("role")),
        academicCycleSectionId: String(form.get("academicCycleSectionId") ?? "") || null,
        ...(startsOn ? { startsOn } : {}),
      },
    });
    if (!sent.ok) return;
    onSaved();
    onClose();
    toast({ title: "Teacher assigned", description: sent.data.teacher.name });
  }

  return (
    <Dialog open onClose={onClose} title={`Assign a teacher to ${offering.subject.name}`}>
      {!allowed ? (
        <Alert tone="warning" title="The teacher list is not available to you">
          Listing the campus&apos;s teachers needs the “manage account access” permission.
        </Alert>
      ) : (
        <form onSubmit={submit} onChange={save.clear} className="grid gap-4">
          <fieldset disabled={save.submitting} className="grid gap-4 sm:grid-cols-2">
            <legend className="sr-only">Assignment</legend>
            <Field label="Teacher" htmlFor="assign-teacher" error={save.fieldErrors.userId} className="sm:col-span-2">
              <Select id="assign-teacher" name="userId" required defaultValue="">
                <option value="" disabled>
                  {query.loading ? "Loading teachers…" : teachers.length === 0 ? "No teachers at this campus" : "Choose a teacher"}
                </option>
                {teachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Role" htmlFor="assign-role" error={save.fieldErrors.role}>
              <Select id="assign-role" name="role" defaultValue="lead">
                {TEACHING_ROLES.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="From" htmlFor="assign-start" error={save.fieldErrors.startsOn} help="Defaults to today.">
              <Input id="assign-start" name="startsOn" type="date" />
            </Field>
            {sections.length > 1 && (
              <Field label="Teaches" htmlFor="assign-section" error={save.fieldErrors.academicCycleSectionId} className="sm:col-span-2">
                <Select id="assign-section" name="academicCycleSectionId" defaultValue="">
                  <option value="">Every section of the offering</option>
                  {sections.map((id) => (
                    <option key={id} value={id}>
                      Only section {sectionName.get(id) ?? "…"}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </fieldset>
          <FormError error={save.error ?? query.error} fields={["userId", "role", "startsOn", "academicCycleSectionId"]} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={onClose} disabled={save.submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.submitting}>
              {save.submitting ? "Assigning…" : "Assign"}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

function EndDialog({ assignment, onClose, onSaved }: { assignment: Assignment; onClose: () => void; onSaved: () => void }) {
  const save = useApiMutation();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const endsOn = String(new FormData(event.currentTarget).get("endsOn") ?? "");
    const sent = await save.send<Assignment>(`${teachingApi.assignment(assignment.id)}/end`, {
      method: "POST",
      body: endsOn ? { endsOn } : {},
    });
    if (!sent.ok) return;
    onSaved();
    onClose();
  }

  return (
    <Dialog open onClose={onClose} title={`End ${assignment.teacher.name}'s assignment`} description="Their past teaching stays on record.">
      <form onSubmit={submit} onChange={save.clear} className="grid gap-4">
        <Field label="Last day" htmlFor="end-date" error={save.fieldErrors.endsOn} help="Defaults to today.">
          <Input id="end-date" name="endsOn" type="date" min={assignment.startsOn} disabled={save.submitting} />
        </Field>
        <FormError error={save.error} fields={["endsOn"]} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={save.submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="destructive" disabled={save.submitting}>
            {save.submitting ? "Ending…" : "End assignment"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
