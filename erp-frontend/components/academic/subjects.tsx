"use client";

import { BookOpen, Ellipsis, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useState, type FormEvent } from "react";
import { useWorkingContext } from "@/components/auth/session";
import { FormError, Loaded } from "@/components/ui/api-states";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Field, Input } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/misc";
import { Pagination, SearchBox, Table, TD, TH, THead, TR } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { withQuery, type Paginated } from "@/lib/api";
import { academicApi, type Subject } from "@/lib/academic";
import { useApiMutation, useApiQuery } from "@/lib/use-api";
import { formatDate } from "@/lib/utils";

const PER_PAGE = 20;

type Dialogs = { kind: "create" } | { kind: "edit" | "delete"; subject: Subject } | null;

/** /subjects: what the campus teaches. A taught subject cannot be deleted. */
export function SubjectsScreen() {
  const toast = useToast();
  const { schoolId, can } = useWorkingContext();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Dialogs>(null);
  const removal = useApiMutation();
  const subjects = useApiQuery<Paginated<Subject>>(
    schoolId ? withQuery(academicApi.subjects, { page, perPage: PER_PAGE, search }) : null,
    { keepPrevious: true },
  );
  const onSearch = useCallback((text: string) => {
    setSearch(text);
    setPage(1);
  }, []);

  const canCreate = can("create subject");
  const canUpdate = can("update subject");
  const canDelete = can("delete subject");

  async function remove(subject: Subject) {
    const sent = await removal.send(academicApi.subject(subject.id), { method: "DELETE" });
    if (!sent.ok) {
      toast({ title: "Could not delete", description: sent.error.message, tone: "error" });
      return;
    }
    subjects.reload();
    toast({ title: `${subject.name} deleted` });
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchBox label="Search subjects" onSearch={onSearch} />
        {canCreate && (
          <Button onClick={() => setDialog({ kind: "create" })}>
            <Plus /> Add subject
          </Button>
        )}
      </div>

      <Loaded query={subjects}>
        {({ data, meta }) =>
          data.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title={search ? "No subject matches" : "No subjects yet"}
              description={search ? "Try another name." : "Add what the campus teaches, e.g. Mathematics (MATH)."}
            />
          ) : (
            <>
              <Table busy={subjects.loading}>
                <THead>
                  <TH>Subject</TH>
                  <TH>Short name</TH>
                  <TH>Added</TH>
                  {(canUpdate || canDelete) && (
                    <TH className="text-right">
                      <span className="sr-only">Actions</span>
                    </TH>
                  )}
                </THead>
                <tbody>
                  {data.map((subject) => (
                    <TR key={subject.id}>
                      <TD className="font-medium">{subject.name}</TD>
                      <TD className="font-mono text-xs">{subject.shortName}</TD>
                      <TD className="whitespace-nowrap">{formatDate(subject.createdAt)}</TD>
                      {(canUpdate || canDelete) && (
                        <TD className="py-2 text-right">
                          <DropdownMenu
                            trigger={<Ellipsis className="size-4" />}
                            triggerLabel={`Actions for ${subject.name}`}
                            triggerClassName="size-9"
                            className="w-44"
                          >
                            {canUpdate && (
                              <DropdownMenuItem onClick={() => setDialog({ kind: "edit", subject })}>
                                <Pencil /> Edit
                              </DropdownMenuItem>
                            )}
                            {canDelete && (
                              <DropdownMenuItem destructive onClick={() => setDialog({ kind: "delete", subject })}>
                                <Trash2 /> Delete
                              </DropdownMenuItem>
                            )}
                          </DropdownMenu>
                        </TD>
                      )}
                    </TR>
                  ))}
                </tbody>
              </Table>
              <Pagination page={meta.page} perPage={meta.perPage} total={meta.total} onPage={setPage} />
            </>
          )
        }
      </Loaded>

      {(dialog?.kind === "create" || dialog?.kind === "edit") && (
        <SubjectDialog
          subject={dialog.kind === "edit" ? dialog.subject : undefined}
          onClose={() => setDialog(null)}
          onSaved={subjects.reload}
        />
      )}
      <ConfirmDialog
        open={dialog?.kind === "delete"}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          if (dialog?.kind === "delete") void remove(dialog.subject);
        }}
        title={`Delete ${dialog?.kind === "delete" ? dialog.subject.name : "this subject"}?`}
        description="Only a subject nobody teaches can be deleted. Its record is kept for history."
        confirmLabel="Delete"
      />
    </div>
  );
}

/** POST /v1/subjects or PATCH /v1/subjects/:id. */
function SubjectDialog({ subject, onClose, onSaved }: { subject?: Subject; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const save = useApiMutation();
  const editing = subject !== undefined;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const shortName = String(form.get("shortName") ?? "").trim();
    const body = subject
      ? { ...(name !== subject.name ? { name } : {}), ...(shortName !== subject.shortName ? { shortName } : {}) }
      : { name, shortName };
    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }
    const sent = await save.send<Subject>(subject ? academicApi.subject(subject.id) : academicApi.subjects, {
      method: subject ? "PATCH" : "POST",
      body,
    });
    if (!sent.ok) return;
    onSaved();
    onClose();
    toast({ title: editing ? "Subject saved" : "Subject added", description: sent.data.name });
  }

  return (
    <Dialog open onClose={onClose} title={editing ? `Edit ${subject.name}` : "Add a subject"}>
      <form onSubmit={submit} onChange={save.clear} className="grid gap-4">
        <fieldset disabled={save.submitting} className="grid gap-4 sm:grid-cols-2">
          <legend className="sr-only">Subject</legend>
          <Field label="Name" htmlFor="subject-name" error={save.fieldErrors.name}>
            <Input id="subject-name" name="name" defaultValue={subject?.name} required maxLength={100} placeholder="Mathematics" autoFocus />
          </Field>
          <Field label="Short name" htmlFor="subject-short" error={save.fieldErrors.shortName} help="Used on timetables and report cards.">
            <Input id="subject-short" name="shortName" defaultValue={subject?.shortName} required maxLength={100} placeholder="MATH" />
          </Field>
        </fieldset>
        <FormError error={save.error} fields={["name", "shortName"]} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={save.submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.submitting}>
            {save.submitting ? "Saving…" : editing ? "Save" : "Add subject"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
