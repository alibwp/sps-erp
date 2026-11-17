"use client";

import { Archive, ArrowDown, ArrowUp, CircleCheck, Ellipsis, Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useWorkingContext } from "@/components/auth/session";
import { StatusBadge } from "@/components/academic/status-dialogs";
import { FormError, Loaded } from "@/components/ui/api-states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Field, Input, Select } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/misc";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import {
  academicApi,
  levelTree,
  STRUCTURE_NEXT,
  STRUCTURE_STATUS_LABELS,
  type Level,
  type StructureStatus,
} from "@/lib/academic";
import { useApiMutation, useApiQuery } from "@/lib/use-api";

type Dialogs = { kind: "create" } | { kind: "edit" | "delete" | "status"; level: Level; to?: StructureStatus } | null;

/**
 * /academic-levels: the campus's classes in display order. A level group (e.g.
 * "Primary") teaches through the levels under it; levels move up and down
 * among their siblings, and are archived rather than deleted once used.
 */
export function LevelsScreen() {
  const toast = useToast();
  const { schoolId, can } = useWorkingContext();
  const [status, setStatus] = useState<StructureStatus | "">("");
  const levels = useApiQuery<Level[]>(schoolId ? `${academicApi.levels}${status ? `?status=${status}` : ""}` : null, {
    keepPrevious: true,
  });
  const action = useApiMutation();
  const [dialog, setDialog] = useState<Dialogs>(null);

  const canCreate = can("create class");
  const canUpdate = can("update class");
  const canDelete = can("delete class");

  async function run(path: string, body: unknown, message: string) {
    const sent = await action.send(path, { method: "POST", body });
    if (!sent.ok) {
      toast({ title: "Could not change the class", description: sent.error.message, tone: "error" });
      return;
    }
    levels.reload();
    if (message) toast({ title: message });
  }

  async function remove(level: Level) {
    const sent = await action.send(academicApi.level(level.id), { method: "DELETE" });
    if (!sent.ok) {
      toast({ title: "Could not delete", description: sent.error.message, tone: "error" });
      return;
    }
    levels.reload();
    toast({ title: `${level.name} deleted` });
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Status
          <Select className="h-9 w-40" value={status} onChange={(event) => setStatus(event.target.value as StructureStatus | "")}>
            <option value="">Every status</option>
            {(Object.keys(STRUCTURE_STATUS_LABELS) as StructureStatus[]).map((value) => (
              <option key={value} value={value}>
                {STRUCTURE_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </label>
        {canCreate && (
          <Button onClick={() => setDialog({ kind: "create" })}>
            <Plus /> Add class
          </Button>
        )}
      </div>

      <Loaded query={levels}>
        {(data) => {
          const tree = levelTree(data);
          return tree.length === 0 ? (
            <EmptyState icon={Layers} title="No classes yet" description="Add the classes (grades) the campus teaches, e.g. Class 1 to Class 10." />
          ) : (
            <Table busy={levels.loading || action.submitting}>
              <THead>
                <TH>Class</TH>
                <TH>Kind</TH>
                <TH>Status</TH>
                {(canUpdate || canDelete) && (
                  <TH className="text-right">
                    <span className="sr-only">Actions</span>
                  </TH>
                )}
              </THead>
              <tbody>
                {tree.map(({ level, depth }) => {
                  const siblings = tree.filter((entry) => entry.level.parentId === level.parentId);
                  const index = siblings.findIndex((entry) => entry.level.id === level.id);
                  return (
                    <TR key={level.id}>
                      <TD style={{ paddingLeft: `${1 + depth * 1.5}rem` }}>
                        <span className={level.isGroup ? "font-semibold" : "font-medium"}>{level.name}</span>
                        {level.code && <span className="ml-2 font-mono text-xs text-muted-foreground">{level.code}</span>}
                      </TD>
                      <TD>{level.isGroup ? <Badge tone="info">Group</Badge> : "Class"}</TD>
                      <TD>
                        <StatusBadge status={level.status} />
                      </TD>
                      {(canUpdate || canDelete) && (
                        <TD className="py-2 text-right">
                          <DropdownMenu
                            trigger={<Ellipsis className="size-4" />}
                            triggerLabel={`Actions for ${level.name}`}
                            triggerClassName="size-9"
                            className="w-48"
                          >
                            {canUpdate && (
                              <>
                                <DropdownMenuItem onClick={() => setDialog({ kind: "edit", level })}>
                                  <Pencil /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={index <= 0}
                                  onClick={() => void run(`${academicApi.level(level.id)}/move`, { direction: "up" }, "")}
                                >
                                  <ArrowUp /> Move up
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={index === siblings.length - 1}
                                  onClick={() => void run(`${academicApi.level(level.id)}/move`, { direction: "down" }, "")}
                                >
                                  <ArrowDown /> Move down
                                </DropdownMenuItem>
                                {STRUCTURE_NEXT[level.status].includes("active") && (
                                  <DropdownMenuItem onClick={() => void run(`${academicApi.level(level.id)}/status`, { status: "active" }, `${level.name} activated`)}>
                                    <CircleCheck /> Activate
                                  </DropdownMenuItem>
                                )}
                                {STRUCTURE_NEXT[level.status].includes("archived") && (
                                  <DropdownMenuItem onClick={() => setDialog({ kind: "status", level, to: "archived" })}>
                                    <Archive /> Archive
                                  </DropdownMenuItem>
                                )}
                              </>
                            )}
                            {canDelete && (
                              <>
                                {canUpdate && <DropdownMenuSeparator />}
                                <DropdownMenuItem destructive onClick={() => setDialog({ kind: "delete", level })}>
                                  <Trash2 /> Delete
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenu>
                        </TD>
                      )}
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          );
        }}
      </Loaded>

      {(dialog?.kind === "create" || dialog?.kind === "edit") && (
        <LevelDialog
          level={dialog.kind === "edit" ? dialog.level : undefined}
          levels={levels.data ?? []}
          onClose={() => setDialog(null)}
          onSaved={levels.reload}
        />
      )}
      <ConfirmDialog
        open={dialog?.kind === "status"}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          if (dialog?.kind === "status") void run(`${academicApi.level(dialog.level.id)}/status`, { status: "archived" }, `${dialog.level.name} archived`);
        }}
        title={`Archive ${dialog?.kind === "status" ? dialog.level.name : "this class"}?`}
        description="It waits until no draft or active section uses it. Its records are kept."
        confirmLabel="Archive"
      />
      <ConfirmDialog
        open={dialog?.kind === "delete"}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          if (dialog?.kind === "delete") void remove(dialog.level);
        }}
        title={`Delete ${dialog?.kind === "delete" ? dialog.level.name : "this class"}?`}
        description="Only an unused class can be deleted. One with classes under it, sections, subjects or exceptions is kept: archive it instead."
        confirmLabel="Delete"
      />
    </div>
  );
}

/** POST /v1/academic-levels or PATCH /v1/academic-levels/:id. */
function LevelDialog({
  level,
  levels,
  onClose,
  onSaved,
}: {
  level?: Level;
  levels: Level[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const save = useApiMutation();
  const editing = level !== undefined;
  const [isGroup, setIsGroup] = useState(level?.isGroup ?? false);
  // A class may sit under an active group; a group sits at the top.
  const groups = levels.filter((item) => item.isGroup && item.status === "active" && item.id !== level?.id);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const code = String(form.get("code") ?? "").trim() || null;
    const parentId = isGroup ? null : String(form.get("parentId") ?? "") || null;

    let body: Record<string, unknown>;
    if (level) {
      body = {};
      if (name !== level.name) body.name = name;
      if (code !== level.code) body.code = code;
      if (parentId !== level.parentId) body.parentId = parentId;
      if (isGroup !== level.isGroup) body.isGroup = isGroup;
      if (Object.keys(body).length === 0) {
        onClose();
        return;
      }
    } else {
      body = { name, code, parentId, isGroup };
    }
    const sent = await save.send<Level>(level ? academicApi.level(level.id) : academicApi.levels, {
      method: level ? "PATCH" : "POST",
      body,
    });
    if (!sent.ok) return;
    onSaved();
    onClose();
    toast({ title: editing ? "Class saved" : "Class added", description: sent.data.name });
  }

  return (
    <Dialog open onClose={onClose} title={editing ? `Edit ${level.name}` : "Add a class"} description={editing ? undefined : "New classes start as drafts."}>
      <form onSubmit={submit} onChange={save.clear} className="grid gap-4">
        <fieldset disabled={save.submitting} className="grid gap-4 sm:grid-cols-2">
          <legend className="sr-only">Class</legend>
          <Field label="Name" htmlFor="level-name" error={save.fieldErrors.name}>
            <Input id="level-name" name="name" defaultValue={level?.name} required maxLength={100} placeholder="Class 5" autoFocus />
          </Field>
          <Field label="Code" htmlFor="level-code" error={save.fieldErrors.code}>
            <Input id="level-code" name="code" defaultValue={level?.code ?? ""} maxLength={100} placeholder="C5" />
          </Field>
          <label className="flex items-start gap-3 rounded-md border p-3 text-sm sm:col-span-2">
            <input type="checkbox" className="mt-0.5 size-4" checked={isGroup} onChange={(event) => setIsGroup(event.target.checked)} />
            <span>
              <span className="block font-medium">This is a group of classes</span>
              <span className="text-muted-foreground">e.g. “Primary”. A group sits at the top and teaches through the classes under it.</span>
            </span>
          </label>
          {!isGroup && (
            <Field
              label="Under group"
              htmlFor="level-parent"
              error={save.fieldErrors.parentId}
              help={groups.length === 0 ? "No active group yet." : undefined}
              className="sm:col-span-2"
            >
              <Select id="level-parent" name="parentId" defaultValue={level?.parentId ?? ""}>
                <option value="">None (top level)</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </fieldset>
        <FormError error={save.error} fields={["name", "code", "parentId", "isGroup"]} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={save.submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.submitting}>
            {save.submitting ? "Saving…" : editing ? "Save" : "Add class"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
