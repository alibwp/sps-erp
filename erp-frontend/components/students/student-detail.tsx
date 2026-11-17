"use client";

import { useRouter } from "next/navigation";
import { ArrowRightLeft, Ellipsis, History, Pencil, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useWorkingContext } from "@/components/auth/session";
import { useLevels, useSections } from "@/components/academic/lookups";
import { EnrollmentBadge } from "@/components/students/students";
import { Page } from "@/components/layout/page-header";
import { FormError, Loaded, LookupError } from "@/components/ui/api-states";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Avatar, EmptyState } from "@/components/ui/misc";
import { Tabs } from "@/components/ui/tabs";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import {
  ENROLLMENT_NEXT,
  ENROLLMENT_STATUS_LABELS,
  isEnrolled,
  teachingApi,
  type EnrollmentHistory,
  type EnrollmentStatus,
  type Placement,
  type Student,
} from "@/lib/teaching";
import { useApiMutation, useApiQuery } from "@/lib/use-api";
import { formatDate } from "@/lib/utils";

type Dialogs = "move" | "status" | "delete" | null;

/** /students/[id]: one learner's enrollment, placements and status history. */
export function StudentDetail({ id }: { id: string }) {
  const student = useApiQuery<Student>(teachingApi.student(id), { keepPrevious: true });
  // Bumped after a move or status change so the history tabs read again.
  const [version, setVersion] = useState(0);
  const name = student.data?.name ?? "Student";
  const changed = () => {
    student.reload();
    setVersion((value) => value + 1);
  };

  return (
    <Page
      title={
        <span className="flex flex-wrap items-center gap-3">
          {name}
          {student.data && <EnrollmentBadge status={student.data.status} />}
        </span>
      }
      breadcrumbs={[{ label: "Students", href: "/students" }, { label: name }]}
      actions={student.data && <StudentActions student={student.data} onChanged={changed} />}
    >
      <Loaded query={student}>
        {(data) => (
          <Tabs
            tabs={[
              { label: "Profile", content: <Profile student={data} /> },
              { label: "Placements", content: <Placements key={`p-${version}`} student={data} /> },
              { label: "Status history", content: <StatusHistory key={`s-${version}`} student={data} /> },
            ]}
          />
        )}
      </Loaded>
    </Page>
  );
}

function StudentActions({ student, onChanged }: { student: Student; onChanged: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { can, working } = useWorkingContext();
  const removal = useApiMutation();
  const [dialog, setDialog] = useState<Dialogs>(null);

  const canUpdate = can("update student");
  const canMove = canUpdate && isEnrolled(student.status) && Boolean(working?.academicYear);
  const canStatus = canUpdate && ENROLLMENT_NEXT[student.status].length > 0;
  const canDelete = can("delete student");

  async function remove() {
    const sent = await removal.send(teachingApi.student(student.id), { method: "DELETE" });
    if (!sent.ok) {
      toast({ title: "Could not remove", description: sent.error.message, tone: "error" });
      return;
    }
    toast({ title: `${student.name} removed from the campus` });
    router.push("/students");
  }

  return (
    <>
      {canUpdate && (
        <ButtonLink href={`/students/${student.id}/edit`} variant="outline">
          <Pencil /> Edit
        </ButtonLink>
      )}
      {canMove && (
        <Button variant="outline" onClick={() => setDialog("move")}>
          <ArrowRightLeft /> Move section
        </Button>
      )}
      {(canStatus || canDelete) && (
        <DropdownMenu trigger={<Ellipsis className="size-4" />} triggerLabel="More actions" triggerVariant="outline" triggerClassName="size-10" className="w-52">
          {canStatus && (
            <DropdownMenuItem onClick={() => setDialog("status")}>
              <History /> Change status
            </DropdownMenuItem>
          )}
          {canDelete && (
            <DropdownMenuItem destructive onClick={() => setDialog("delete")}>
              <Trash2 /> Remove from campus
            </DropdownMenuItem>
          )}
        </DropdownMenu>
      )}

      {dialog === "move" && <MoveDialog student={student} onClose={() => setDialog(null)} onSaved={onChanged} />}
      {dialog === "status" && <StatusDialog student={student} onClose={() => setDialog(null)} onSaved={onChanged} />}
      <ConfirmDialog
        open={dialog === "delete"}
        onClose={() => setDialog(null)}
        onConfirm={() => void remove()}
        title={`Remove ${student.name} from the campus?`}
        description="This withdraws an open enrollment, ends their campus membership, and deletes the account unless they still belong to another campus or hold other access. To record a learner leaving, change their status instead."
        confirmLabel="Remove"
      />
    </>
  );
}

function Profile({ student }: { student: Student }) {
  const levels = useLevels();
  const address = [student.address, student.addressLine2, student.city, student.state, student.postalCode, student.country]
    .filter(Boolean)
    .join(", ");
  const facts: Array<[string, string]> = [
    ["Admission number", student.admissionNumber],
    ["Admitted on", formatDate(student.admissionDate)],
    ["Class and section", student.section ? `${levels.name.get(student.section.academicLevelId) ?? ""} · ${student.section.name}` : "Not placed"],
    ["Email", student.email],
    ["Phone", student.phone ?? "—"],
    ["Date of birth", formatDate(student.birthday)],
    ["Gender", student.gender ?? "—"],
    ["Nationality", student.nationality ?? "—"],
    ["Address", address || "—"],
    ["Account", student.accountStatus.charAt(0).toUpperCase() + student.accountStatus.slice(1)],
  ];

  return (
    <div className="grid gap-8 lg:grid-cols-[auto_minmax(0,1fr)]">
      <Avatar name={student.name} size="xl" />
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
        {facts.map(([label, value]) => (
          <div key={label} className="grid gap-1">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className={label === "Admission number" ? "font-mono text-sm" : "text-sm"}>{value}</dd>
          </div>
        ))}
        {student.transferredFromId && (
          <div className="grid gap-1">
            <dt className="text-sm text-muted-foreground">Enrollment</dt>
            <dd>
              <Badge tone="info">Transferred in from another campus</Badge>
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}

// ---------------------------------------------------------------- 7.5 Placements

function Placements({ student }: { student: Student }) {
  const levels = useLevels();
  const placements = useApiQuery<Placement[]>(`${teachingApi.student(student.id)}/placements`);
  return (
    <Loaded query={placements}>
      {(data) =>
        data.length === 0 ? (
          <EmptyState icon={ArrowRightLeft} title="No placements yet" />
        ) : (
          <Table>
            <THead>
              <TH>Section</TH>
              <TH>From</TH>
              <TH>Reason</TH>
              <TH>By</TH>
            </THead>
            <tbody>
              {[...data].reverse().map((placement, index) => (
                <TR key={placement.id}>
                  <TD>
                    <span className="font-medium">
                      {levels.name.get(placement.section.academicLevelId) ?? ""} · {placement.section.name}
                    </span>
                    {index === 0 && isEnrolled(student.status) && (
                      <Badge tone="success" className="ml-2">
                        Now
                      </Badge>
                    )}
                  </TD>
                  <TD className="whitespace-nowrap">{formatDate(placement.effectiveOn)}</TD>
                  <TD className="max-w-80">{placement.reason ?? "—"}</TD>
                  <TD>{placement.changedBy?.name ?? "—"}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )
      }
    </Loaded>
  );
}

/** The active sections of the working year and the classes they belong to, for the dialogs below. */
function useWorkingSections() {
  const { working } = useWorkingContext();
  const levels = useLevels();
  const sections = useSections(working?.academicYear?.id ?? null, undefined, "active");
  return { levels: levels.teachable, sections: sections.sections, queries: [levels.query, sections.query] };
}

/** Sections grouped by class, as select options. */
function SectionOptions({ choices, exclude }: { choices: ReturnType<typeof useWorkingSections>; exclude?: string }) {
  return (
    <>
      {choices.levels.map((level) => {
        const ofLevel = choices.sections.filter((section) => section.academicLevelId === level.id && section.id !== exclude);
        if (ofLevel.length === 0) return null;
        return (
          <optgroup key={level.id} label={level.name}>
            {ofLevel.map((section) => (
              <option key={section.id} value={section.id}>
                {level.name} · {section.name}
              </option>
            ))}
          </optgroup>
        );
      })}
    </>
  );
}

/**
 * POST /v1/students/:id/placements: another active section of the working
 * year. Refused for a closed enrollment, a full section or a future day.
 */
function MoveDialog({ student, onClose, onSaved }: { student: Student; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { working } = useWorkingContext();
  const save = useApiMutation();
  const choices = useWorkingSections();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const effectiveOn = String(form.get("effectiveOn") ?? "");
    const sent = await save.send<Student>(`${teachingApi.student(student.id)}/placements`, {
      method: "POST",
      body: {
        academicCycleSectionId: String(form.get("academicCycleSectionId")),
        reason: String(form.get("reason") ?? "").trim() || null,
        ...(effectiveOn ? { effectiveOn } : {}),
      },
    });
    if (!sent.ok) return;
    onSaved();
    onClose();
    toast({ title: `${student.name} moved`, description: sent.data.section ? `Now in section ${sent.data.section.name}.` : undefined });
  }

  return (
    <Dialog open onClose={onClose} title={`Move ${student.name}`} description={`To another section of ${working?.academicYear?.name ?? "the working year"}.`}>
      <form onSubmit={submit} onChange={save.clear} className="grid gap-4">
        <LookupError queries={choices.queries} />
        <fieldset disabled={save.submitting} className="grid gap-4">
          <legend className="sr-only">Placement</legend>
          <Field label="New section" htmlFor="move-section" error={save.fieldErrors.academicCycleSectionId}>
            <Select id="move-section" name="academicCycleSectionId" required defaultValue="">
              <option value="" disabled>
                Choose a section
              </option>
              <SectionOptions choices={choices} exclude={student.section?.id} />
            </Select>
          </Field>
          <Field label="From" htmlFor="move-date" error={save.fieldErrors.effectiveOn} help="Defaults to today; never later.">
            <Input id="move-date" name="effectiveOn" type="date" />
          </Field>
          <Field label="Reason (optional)" htmlFor="move-reason" error={save.fieldErrors.reason}>
            <Textarea id="move-reason" name="reason" maxLength={500} rows={2} />
          </Field>
        </fieldset>
        <FormError error={save.error} fields={["academicCycleSectionId", "effectiveOn", "reason"]} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={save.submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.submitting}>
            {save.submitting ? "Moving…" : "Move"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------- 7.6 Status history

function StatusHistory({ student }: { student: Student }) {
  const history = useApiQuery<EnrollmentHistory[]>(`${teachingApi.student(student.id)}/status-changes`);
  return (
    <Loaded query={history}>
      {(data) =>
        data.length === 0 ? (
          <EmptyState icon={History} title="No status changes yet" />
        ) : (
          <Table>
            <THead>
              <TH>Change</TH>
              <TH>From</TH>
              <TH>Reason</TH>
              <TH>By</TH>
            </THead>
            <tbody>
              {[...data].reverse().map((entry) => (
                <TR key={entry.id}>
                  <TD>
                    <span className="flex flex-wrap items-center gap-2">
                      {entry.fromStatus ? (
                        <>
                          <EnrollmentBadge status={entry.fromStatus} /> →
                        </>
                      ) : (
                        <span className="text-muted-foreground">Admitted as</span>
                      )}
                      <EnrollmentBadge status={entry.toStatus} />
                    </span>
                  </TD>
                  <TD className="whitespace-nowrap">{formatDate(entry.effectiveOn)}</TD>
                  <TD className="max-w-80">{entry.reason ?? "—"}</TD>
                  <TD>{entry.changedBy?.name ?? "—"}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )
      }
    </Loaded>
  );
}

const LEFT: readonly EnrollmentStatus[] = ["withdrawn", "graduated"];

/** The section a returning learner comes back to; its lists load only when shown. */
function TakeBackSection({ error }: { error?: string }) {
  const choices = useWorkingSections();
  return (
    <>
      <LookupError queries={choices.queries} />
      <Field
        label="Section"
        htmlFor="enrollment-section"
        error={error}
        help="Optional: the section they come back to. It needs a free seat."
      >
        <Select id="enrollment-section" name="academicCycleSectionId" defaultValue="">
          <option value="">Their last section</option>
          <SectionOptions choices={choices} />
        </Select>
      </Field>
    </>
  );
}

/**
 * POST /v1/students/:id/status-changes. Taking back a learner who left needs
 * a free seat, and may place them in another section.
 */
function StatusDialog({ student, onClose, onSaved }: { student: Student; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const save = useApiMutation();
  const moves = ENROLLMENT_NEXT[student.status];
  const [to, setTo] = useState<EnrollmentStatus>(moves[0]);
  const takingBack = to === "active" && LEFT.includes(student.status);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const effectiveOn = String(form.get("effectiveOn") ?? "");
    const section = String(form.get("academicCycleSectionId") ?? "");
    const sent = await save.send<Student>(`${teachingApi.student(student.id)}/status-changes`, {
      method: "POST",
      body: {
        status: to,
        reason: String(form.get("reason") ?? "").trim() || null,
        ...(effectiveOn ? { effectiveOn } : {}),
        ...(takingBack && section ? { academicCycleSectionId: section } : {}),
      },
    });
    if (!sent.ok) return;
    onSaved();
    onClose();
    toast({ title: `${student.name} is now ${ENROLLMENT_STATUS_LABELS[to].toLowerCase()}` });
  }

  return (
    <Dialog open onClose={onClose} title={`Change ${student.name}'s status`}>
      <form onSubmit={submit} onChange={save.clear} className="grid gap-4">
        <fieldset disabled={save.submitting} className="grid gap-4">
          <legend className="sr-only">Status</legend>
          <div className="flex items-center gap-2 text-sm">
            Now <EnrollmentBadge status={student.status} />
          </div>
          <Field label="New status" htmlFor="enrollment-to" error={save.fieldErrors.status}>
            <Select id="enrollment-to" value={to} onChange={(event) => setTo(event.target.value as EnrollmentStatus)}>
              {moves.map((move) => (
                <option key={move} value={move}>
                  {ENROLLMENT_STATUS_LABELS[move]}
                </option>
              ))}
            </Select>
          </Field>
          {takingBack && <TakeBackSection error={save.fieldErrors.academicCycleSectionId} />}
          <Field label="From" htmlFor="enrollment-date" error={save.fieldErrors.effectiveOn} help="Defaults to today; never later.">
            <Input id="enrollment-date" name="effectiveOn" type="date" />
          </Field>
          <Field label="Reason (optional)" htmlFor="enrollment-reason" error={save.fieldErrors.reason}>
            <Textarea id="enrollment-reason" name="reason" maxLength={500} rows={2} />
          </Field>
        </fieldset>
        <FormError error={save.error} fields={["status", "academicCycleSectionId", "effectiveOn", "reason"]} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={save.submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.submitting} variant={isEnrolled(to) ? "default" : "destructive"}>
            {save.submitting ? "Saving…" : `Mark ${ENROLLMENT_STATUS_LABELS[to].toLowerCase()}`}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
