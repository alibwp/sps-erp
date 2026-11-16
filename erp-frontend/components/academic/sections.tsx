"use client";

import { Archive, ArrowDown, ArrowUp, CircleCheck, Ellipsis, LayoutGrid, Pencil, Plus } from "lucide-react";
import { useCallback, useMemo, useState, type FormEvent } from "react";
import { useWorkingContext } from "@/components/auth/session";
import { useTeachers } from "@/components/academic/lookups";
import { StatusBadge } from "@/components/academic/status-dialogs";
import { FormError, Loaded, LookupError } from "@/components/ui/api-states";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Field, Input, Select } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/misc";
import { Pagination, SearchBox, Table, TD, TH, THead, TR } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { withQuery, type Paginated } from "@/lib/api";
import {
  academicApi,
  levelTree,
  STRUCTURE_NEXT,
  STRUCTURE_STATUS_LABELS,
  type Level,
  type Section,
  type StructureStatus,
  type Year,
} from "@/lib/academic";
import { useApiMutation, useApiQuery } from "@/lib/use-api";

const PER_PAGE = 20;

type Dialogs = { kind: "create" } | { kind: "edit" | "archive"; section: Section } | null;

/**
 * /academic-cycle-sections: the sections of a class for a school year
 * (e.g. Class 5 – A). The year filter starts on the working year.
 */
export function SectionsScreen() {
  const toast = useToast();
  const { schoolId, working, can } = useWorkingContext();
  const [yearId, setYearId] = useState<string | null>(null);
  const [levelId, setLevelId] = useState("");
  const [status, setStatus] = useState<StructureStatus | "">("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const onSearch = useCallback((text: string) => {
    setSearch(text);
    setPage(1);
  }, []);
  const [dialog, setDialog] = useState<Dialogs>(null);
  const action = useApiMutation();

  const years = useApiQuery<Paginated<Year>>(schoolId ? `${academicApi.years}?perPage=100` : null, { keepPrevious: true });
  const levels = useApiQuery<Level[]>(schoolId ? academicApi.levels : null, { keepPrevious: true });
  // The working year until the person picks another ("" = every year).
  const year = yearId ?? working?.academicYear?.id ?? "";

  const sections = useApiQuery<Paginated<Section>>(
    schoolId
      ? withQuery(academicApi.sections, { page, perPage: PER_PAGE, search, academicYearId: year, academicLevelId: levelId, status })
      : null,
    { keepPrevious: true },
  );

  const levelName = useMemo(() => new Map((levels.data ?? []).map((level) => [level.id, level.name])), [levels.data]);
  const yearName = useMemo(() => new Map((years.data?.data ?? []).map((item) => [item.id, item.name])), [years.data]);
  const canCreate = can("create section");
  const canUpdate = can("update section");

  const filter = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    setPage(1);
  };

  async function run(section: Section, path: string, body: unknown, message: string) {
    const sent = await action.send(path, { method: "POST", body });
    if (!sent.ok) {
      toast({ title: `Could not change ${section.name}`, description: sent.error.message, tone: "error" });
      return;
    }
    sections.reload();
    if (message) toast({ title: message });
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <SearchBox label="Search sections" onSearch={onSearch} className="max-w-56" />
          <label className="flex items-center gap-2">
            Year
            <Select className="h-9 w-40" value={year} onChange={(event) => filter(setYearId)(event.target.value)}>
              <option value="">Every year</option>
              {years.data?.data.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex items-center gap-2">
            Class
            <Select className="h-9 w-44" value={levelId} onChange={(event) => filter(setLevelId)(event.target.value)}>
              <option value="">Every class</option>
              {levelTree(levels.data ?? [])
                .filter(({ level }) => !level.isGroup)
                .map(({ level }) => (
                  <option key={level.id} value={level.id}>
                    {level.name}
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
        {canCreate && (
          <Button onClick={() => setDialog({ kind: "create" })}>
            <Plus /> Add section
          </Button>
        )}
      </div>

      <LookupError queries={[years, levels]} />

      <Loaded query={sections}>
        {({ data, meta }) =>
          data.length === 0 ? (
            <EmptyState
              icon={LayoutGrid}
              title="No sections"
              description="A section is one group of learners in a class for a school year, e.g. Class 5 – A."
            />
          ) : (
            <>
              <Table busy={sections.loading || action.submitting}>
                <THead>
                  <TH>Section</TH>
                  <TH>Class</TH>
                  {!year && <TH>Year</TH>}
                  <TH>Class teacher</TH>
                  <TH>Room</TH>
                  <TH className="text-right">Capacity</TH>
                  <TH>Status</TH>
                  {canUpdate && (
                    <TH className="text-right">
                      <span className="sr-only">Actions</span>
                    </TH>
                  )}
                </THead>
                <tbody>
                  {data.map((section) => (
                    <TR key={section.id}>
                      <TD>
                        <span className="font-medium">{section.name}</span>
                        {section.label && <span className="block text-xs text-muted-foreground">{section.label}</span>}
                      </TD>
                      <TD>{levelName.get(section.academicLevelId) ?? "—"}</TD>
                      {!year && <TD>{yearName.get(section.academicYearId) ?? "—"}</TD>}
                      <TD>{section.homeroomTeacher?.name ?? <span className="text-muted-foreground">—</span>}</TD>
                      <TD>{section.room ?? "—"}</TD>
                      <TD className="text-right tabular-nums">{section.capacity ?? "—"}</TD>
                      <TD>
                        <StatusBadge status={section.status} />
                      </TD>
                      {canUpdate && (
                        <TD className="py-2 text-right">
                          <DropdownMenu
                            trigger={<Ellipsis className="size-4" />}
                            triggerLabel={`Actions for ${section.name}`}
                            triggerClassName="size-9"
                            className="w-48"
                          >
                            <DropdownMenuItem onClick={() => setDialog({ kind: "edit", section })}>
                              <Pencil /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => void run(section, `${academicApi.section(section.id)}/move`, { direction: "up" }, "")}>
                              <ArrowUp /> Move up
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => void run(section, `${academicApi.section(section.id)}/move`, { direction: "down" }, "")}>
                              <ArrowDown /> Move down
                            </DropdownMenuItem>
                            {STRUCTURE_NEXT[section.status].includes("active") && (
                              <DropdownMenuItem
                                onClick={() => void run(section, `${academicApi.section(section.id)}/status`, { status: "active" }, `${section.name} activated`)}
                              >
                                <CircleCheck /> Activate
                              </DropdownMenuItem>
                            )}
                            {STRUCTURE_NEXT[section.status].includes("archived") && (
                              <DropdownMenuItem onClick={() => setDialog({ kind: "archive", section })}>
                                <Archive /> Archive
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
        <SectionDialog
          section={dialog.kind === "edit" ? dialog.section : undefined}
          years={years.data?.data ?? []}
          levels={levels.data ?? []}
          defaultYearId={year}
          defaultLevelId={levelId}
          onClose={() => setDialog(null)}
          onSaved={sections.reload}
        />
      )}
      <ConfirmDialog
        open={dialog?.kind === "archive"}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          if (dialog?.kind === "archive")
            void run(dialog.section, `${academicApi.section(dialog.section.id)}/status`, { status: "archived" }, `${dialog.section.name} archived`);
        }}
        title={`Archive ${dialog?.kind === "archive" ? dialog.section.name : "this section"}?`}
        description="It stops taking part in the year. Its records are kept. An archived section cannot be brought back."
        confirmLabel="Archive"
      />
    </div>
  );
}

const OPTIONAL_TEXT = ["label", "stream", "shift", "language", "room"] as const;

/**
 * POST /v1/academic-cycle-sections (created as a draft) or PATCH …/:id. The
 * class teacher must teach at the campus; the list of teachers needs
 * "manage account access", so without it the field is left out.
 */
function SectionDialog({
  section,
  years,
  levels,
  defaultYearId,
  defaultLevelId,
  onClose,
  onSaved,
}: {
  section?: Section;
  years: Year[];
  levels: Level[];
  defaultYearId: string;
  defaultLevelId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const save = useApiMutation();
  const editing = section !== undefined;
  const { allowed: canPickTeacher, teachers } = useTeachers();
  // Sections are added to an active, teachable class of a year that is not closed.
  const teachable = levelTree(levels).filter(({ level }) => !level.isGroup && level.status === "active");
  const openYears = years.filter((year) => year.status !== "closed" && year.status !== "archived");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "").trim();
    const capacity = text("capacity") ? Number(text("capacity")) : null;
    const teacher = canPickTeacher ? text("homeroomTeacherId") || null : undefined;

    let body: Record<string, unknown>;
    if (section) {
      body = {};
      if (text("name") !== section.name) body.name = text("name");
      for (const field of OPTIONAL_TEXT) if ((text(field) || null) !== section[field]) body[field] = text(field) || null;
      if (capacity !== section.capacity) body.capacity = capacity;
      if (teacher !== undefined && teacher !== (section.homeroomTeacher?.id ?? null)) body.homeroomTeacherId = teacher;
      if (Object.keys(body).length === 0) {
        onClose();
        return;
      }
    } else {
      body = {
        academicYearId: text("academicYearId"),
        academicLevelId: text("academicLevelId"),
        name: text("name"),
        capacity,
        ...Object.fromEntries(OPTIONAL_TEXT.map((field) => [field, text(field) || null])),
        ...(teacher !== undefined ? { homeroomTeacherId: teacher } : {}),
      };
    }

    const sent = await save.send<Section>(section ? academicApi.section(section.id) : academicApi.sections, {
      method: section ? "PATCH" : "POST",
      body,
    });
    if (!sent.ok) return;
    onSaved();
    onClose();
    toast({ title: editing ? "Section saved" : "Section added", description: editing ? sent.data.name : `${sent.data.name} starts as a draft.` });
  }

  const errors = save.fieldErrors;

  return (
    <Dialog open onClose={onClose} title={editing ? `Edit ${section.name}` : "Add a section"} className="max-h-[90vh] max-w-2xl overflow-y-auto">
      <form onSubmit={submit} onChange={save.clear} className="grid gap-4">
        <fieldset disabled={save.submitting} className="grid gap-4 sm:grid-cols-2">
          <legend className="sr-only">Section</legend>
          {!editing && (
            <>
              <Field label="School year" htmlFor="section-year" error={errors.academicYearId}>
                <Select
                  id="section-year"
                  name="academicYearId"
                  required
                  defaultValue={openYears.some((year) => year.id === defaultYearId) ? defaultYearId : ""}
                >
                  <option value="" disabled>
                    Choose a year
                  </option>
                  {openYears.map((year) => (
                    <option key={year.id} value={year.id}>
                      {year.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Class" htmlFor="section-level" error={errors.academicLevelId} help={teachable.length === 0 ? "Activate a class first." : undefined}>
                <Select
                  id="section-level"
                  name="academicLevelId"
                  required
                  defaultValue={teachable.some(({ level }) => level.id === defaultLevelId) ? defaultLevelId : ""}
                >
                  <option value="" disabled>
                    Choose a class
                  </option>
                  {teachable.map(({ level }) => (
                    <option key={level.id} value={level.id}>
                      {level.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          )}
          <Field label="Name" htmlFor="section-name" error={errors.name}>
            <Input id="section-name" name="name" defaultValue={section?.name} required maxLength={100} placeholder="A" />
          </Field>
          <Field label="Label" htmlFor="section-label" error={errors.label}>
            <Input id="section-label" name="label" defaultValue={section?.label ?? ""} maxLength={100} placeholder="Blue" />
          </Field>
          {canPickTeacher && (
            <Field label="Class teacher" htmlFor="section-teacher" error={errors.homeroomTeacherId} className="sm:col-span-2">
              <Select id="section-teacher" name="homeroomTeacherId" defaultValue={section?.homeroomTeacher?.id ?? ""}>
                <option value="">None</option>
                {/* Keep the current teacher even if the list leaves them out. */}
                {section?.homeroomTeacher && !teachers.some((teacher) => teacher.id === section.homeroomTeacher?.id) && (
                  <option value={section.homeroomTeacher.id}>{section.homeroomTeacher.name}</option>
                )}
                {teachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Room" htmlFor="section-room" error={errors.room}>
            <Input id="section-room" name="room" defaultValue={section?.room ?? ""} maxLength={100} />
          </Field>
          <Field label="Capacity" htmlFor="section-capacity" error={errors.capacity}>
            <Input id="section-capacity" name="capacity" type="number" min={1} max={999} defaultValue={section?.capacity ?? ""} />
          </Field>
          <Field label="Stream" htmlFor="section-stream" error={errors.stream}>
            <Input id="section-stream" name="stream" defaultValue={section?.stream ?? ""} maxLength={100} placeholder="Science" />
          </Field>
          <Field label="Shift" htmlFor="section-shift" error={errors.shift}>
            <Input id="section-shift" name="shift" defaultValue={section?.shift ?? ""} maxLength={100} placeholder="Morning" />
          </Field>
          <Field label="Language" htmlFor="section-language" error={errors.language}>
            <Input id="section-language" name="language" defaultValue={section?.language ?? ""} maxLength={100} placeholder="English" />
          </Field>
        </fieldset>
        <FormError
          error={save.error}
          fields={["academicYearId", "academicLevelId", "name", "capacity", "homeroomTeacherId", ...OPTIONAL_TEXT]}
        />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={save.submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.submitting}>
            {save.submitting ? "Saving…" : editing ? "Save" : "Add section"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
