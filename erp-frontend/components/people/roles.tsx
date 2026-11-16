"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, Copy, Pencil, Plus, RotateCcw, ShieldAlert, ShieldCheck, Users } from "lucide-react";
import { useCallback, useMemo, useState, type FormEvent } from "react";
import { useWorkingContext } from "@/components/auth/session";
import { PermissionsMatrix } from "@/components/screens/permissions-matrix";
import { Page } from "@/components/layout/page-header";
import { FormError, Loaded } from "@/components/ui/api-states";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, EmptyState, SectionHeading } from "@/components/ui/misc";
import { Pagination, SearchBox, Table, TD, TH, THead, TR } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { withQuery, type Paginated } from "@/lib/api";
import { peopleApi, type Role, type RoleDetail } from "@/lib/people";
import { useApiMutation, useApiQuery } from "@/lib/use-api";

const PER_PAGE = 20;

/** What the signed-in person may put in a role; only asked when they manage roles. */
function useGrantable() {
  const { can } = useWorkingContext();
  const query = useApiQuery<{ permissions: string[] }>(can("manage role") ? peopleApi.grantable : null);
  const set = useMemo(() => new Set(query.data?.permissions ?? []), [query.data]);
  return { query, set, ready: query.data !== undefined };
}

export function RoleKind({ role }: { role: Role }) {
  if (role.builtIn) return <Badge tone="info">Built in</Badge>;
  if (role.shared) return <Badge>Shared</Badge>;
  return <Badge tone="success">This campus</Badge>;
}

/** "New role", for "manage role". */
export function NewRoleButton() {
  const { can } = useWorkingContext();
  if (!can("manage role")) return null;
  return (
    <ButtonLink href="/roles/create">
      <Plus /> New role
    </ButtonLink>
  );
}

/** /roles: roles offered here, or the archived ones. */
export function RoleList() {
  const { schoolId } = useWorkingContext();
  const [archived, setArchived] = useState<"false" | "true">("false");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const roles = useApiQuery<Paginated<Role>>(
    schoolId ? withQuery(peopleApi.roles, { page, perPage: PER_PAGE, search, archived }) : null,
    { keepPrevious: true },
  );
  const onSearch = useCallback((text: string) => {
    setSearch(text);
    setPage(1);
  }, []);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox label="Search roles" onSearch={onSearch} />
        <Select
          className="h-9 w-40"
          aria-label="Which roles"
          value={archived}
          onChange={(event) => {
            setArchived(event.target.value as "false" | "true");
            setPage(1);
          }}
        >
          <option value="false">Offered</option>
          <option value="true">Archived</option>
        </Select>
      </div>
      <Loaded query={roles}>
        {({ data, meta }) =>
          data.length === 0 ? (
            <EmptyState icon={ShieldCheck} title={archived === "true" ? "No archived roles" : "No roles"} />
          ) : (
            <>
              <Table busy={roles.loading}>
                <THead>
                  <TH>Role</TH>
                  <TH>Kind</TH>
                  <TH className="text-right">People here</TH>
                  <TH className="text-right">Permissions</TH>
                </THead>
                <tbody>
                  {data.map((role) => (
                    <TR key={role.id}>
                      <TD className="max-w-96">
                        <Link href={`/roles/${role.id}`} className="font-medium hover:underline hover:underline-offset-4">
                          {role.name}
                        </Link>
                        {role.description && <span className="block truncate text-xs text-muted-foreground">{role.description}</span>}
                      </TD>
                      <TD>
                        <RoleKind role={role} />
                      </TD>
                      <TD className="text-right tabular-nums">{role.holders}</TD>
                      <TD className="text-right tabular-nums">{role.permissions.length}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
              <Pagination page={meta.page} perPage={meta.perPage} total={meta.total} onPage={setPage} />
            </>
          )
        }
      </Loaded>
    </div>
  );
}

// ---------------------------------------------------------------- Detail

type Dialogs = "copy" | "archive" | null;

/** /roles/[id]: what the role holds and who holds it here. */
export function RoleDetailScreen({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const { can } = useWorkingContext();
  const role = useApiQuery<RoleDetail>(peopleApi.role(id), { keepPrevious: true });
  const action = useApiMutation();
  const [dialog, setDialog] = useState<Dialogs>(null);
  const manage = can("manage role");
  const data = role.data;
  const name = data?.name ?? "Role";

  async function setArchived(archive: boolean) {
    const sent = await action.send<RoleDetail>(`${peopleApi.role(id)}/${archive ? "archive" : "restore"}`, { method: "POST" });
    if (!sent.ok) {
      toast({ title: archive ? "Could not archive" : "Could not restore", description: sent.error.message, tone: "error" });
      return;
    }
    role.reload();
    toast({ title: archive ? `${sent.data.name} archived` : `${sent.data.name} offered again`, description: archive ? "People holding it keep it." : undefined });
  }

  return (
    <Page
      title={
        <span className="flex flex-wrap items-center gap-3">
          {name}
          {data && <RoleKind role={data} />}
          {data?.archivedAt && <Badge tone="warning">Archived</Badge>}
        </span>
      }
      breadcrumbs={[{ label: "Roles", href: "/roles" }, { label: name }]}
      actions={
        data &&
        manage && (
          <>
            {!data.builtIn && !data.archivedAt && (
              <ButtonLink href={`/roles/${id}/edit`} variant="outline">
                <Pencil /> Edit
              </ButtonLink>
            )}
            <Button variant="outline" onClick={() => setDialog("copy")}>
              <Copy /> Copy
            </Button>
            {data.archivedAt ? (
              <Button variant="outline" onClick={() => void setArchived(false)} disabled={action.submitting}>
                <RotateCcw /> Restore
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setDialog("archive")} disabled={action.submitting}>
                <Archive /> Archive
              </Button>
            )}
          </>
        )
      }
    >
      <Loaded query={role}>
        {(detail) => (
          <div className="grid gap-10">
            {detail.description && <p className="max-w-3xl text-sm text-muted-foreground">{detail.description}</p>}
            {detail.builtIn && (
              <Alert tone="default" title="Built-in role">
                It can be given out but never changed. Copy it to make a role of your own.
              </Alert>
            )}
            {detail.shared && !detail.builtIn && (
              <Alert tone="default" title="Shared role">
                Every campus can give it out. Editing it gives this campus its own copy and moves its holders here onto it.
              </Alert>
            )}
            <section className="grid gap-4" aria-labelledby="role-permissions">
              <SectionHeading title={`Permissions · ${detail.permissions.length}`} id="role-permissions" />
              <PermissionsMatrix value={new Set(detail.permissions)} />
            </section>
            <section className="grid gap-4" aria-labelledby="role-people">
              <SectionHeading title={`People holding it here · ${detail.people.length}`} id="role-people" />
              {detail.people.length === 0 ? (
                <EmptyState icon={Users} title="Nobody holds this role here" />
              ) : (
                <Table>
                  <THead>
                    <TH>Name</TH>
                    <TH>Email</TH>
                  </THead>
                  <tbody>
                    {detail.people.map((person) => (
                      <TR key={person.id}>
                        <TD>
                          {can("manage account access") ? (
                            <Link href={`/admins/${person.id}`} className="font-medium hover:underline hover:underline-offset-4">
                              {person.name}
                            </Link>
                          ) : (
                            <span className="font-medium">{person.name}</span>
                          )}
                        </TD>
                        <TD>{person.email}</TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              )}
            </section>
          </div>
        )}
      </Loaded>

      {dialog === "copy" && data && (
        <CopyDialog role={data} onClose={() => setDialog(null)} onCopied={(copy) => router.push(`/roles/${copy.id}`)} />
      )}
      <ConfirmDialog
        open={dialog === "archive"}
        onClose={() => setDialog(null)}
        onConfirm={() => void setArchived(true)}
        title={`Archive ${name}?`}
        description="It is no longer offered to new people. The people holding it keep it."
        confirmLabel="Archive"
      />
    </Page>
  );
}

/** POST /v1/roles/:id/copies: the copy holds only what you hold here. */
function CopyDialog({ role, onClose, onCopied }: { role: Role; onClose: () => void; onCopied: (copy: RoleDetail) => void }) {
  const toast = useToast();
  const save = useApiMutation();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") ?? "").trim();
    const sent = await save.send<RoleDetail>(`${peopleApi.role(role.id)}/copies`, { method: "POST", body: { name } });
    if (!sent.ok) return;
    onClose();
    toast({ title: `${sent.data.name} created`, description: `${sent.data.permissions.length} permissions copied.` });
    onCopied(sent.data);
  }

  return (
    <Dialog open onClose={onClose} title={`Copy ${role.name}`} description="The copy holds only the permissions you hold yourself.">
      <form onSubmit={submit} onChange={save.clear} className="grid gap-4">
        <Field label="Name of the copy" htmlFor="copy-name" error={save.fieldErrors.name}>
          <Input id="copy-name" name="name" defaultValue={`${role.name} (copy)`} required maxLength={100} autoFocus disabled={save.submitting} />
        </Field>
        <FormError error={save.error} fields={["name"]} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={save.submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.submitting}>
            {save.submitting ? "Copying…" : "Copy role"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------- Create / edit

/** /roles/create */
export function CreateRole() {
  const { ready, can } = useWorkingContext();
  return (
    <Page title="New role" breadcrumbs={[{ label: "Roles", href: "/roles" }, { label: "New role" }]}>
      {ready && !can("manage role") ? <NoManage /> : <RoleForm />}
    </Page>
  );
}

/** /roles/[id]/edit: PUT /v1/roles/:id (not for built-in roles). */
export function EditRole({ id }: { id: string }) {
  const { ready, can } = useWorkingContext();
  const role = useApiQuery<RoleDetail>(peopleApi.role(id));
  const name = role.data?.name ?? "Role";
  return (
    <Page title={`Edit ${name}`} breadcrumbs={[{ label: "Roles", href: "/roles" }, { label: name, href: `/roles/${id}` }, { label: "Edit" }]}>
      {ready && !can("manage role") ? (
        <NoManage />
      ) : (
        <Loaded query={role}>
          {(data) =>
            data.builtIn ? (
              <Alert tone="warning" title="Built-in roles cannot be changed">
                Copy it from the <Link href={`/roles/${id}`} className="underline">role page</Link> and change the copy.
              </Alert>
            ) : (
              <RoleForm role={data} />
            )
          }
        </Loaded>
      )}
    </Page>
  );
}

function NoManage() {
  return (
    <Alert tone="warning" icon={ShieldAlert} title="You cannot change roles">
      Writing roles needs the “manage role” permission.
    </Alert>
  );
}

function RoleForm({ role }: { role?: RoleDetail }) {
  const router = useRouter();
  const toast = useToast();
  const save = useApiMutation();
  const grantable = useGrantable();
  const [permissions, setPermissions] = useState<Set<string>>(() => new Set(role?.permissions ?? []));
  const editing = role !== undefined;
  // The backend refuses saving a role that holds anything you do not hold.
  const beyond = grantable.ready ? (role?.permissions ?? []).filter((name) => !grantable.set.has(name)) : [];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const description = String(form.get("description") ?? "").trim() || null;
    const body = role
      ? { permissions: [...permissions], description }
      : { name: String(form.get("name") ?? "").trim(), permissions: [...permissions], description };
    const sent = await save.send<RoleDetail>(role ? peopleApi.role(role.id) : peopleApi.roles, {
      method: role ? "PUT" : "POST",
      body,
    });
    if (!sent.ok) return;
    const copied = role && sent.data.id !== role.id;
    toast({
      title: copied ? "This campus now has its own copy" : editing ? "Role saved" : "Role created",
      description: copied ? "Its holders here moved onto the copy." : sent.data.name,
    });
    router.push(`/roles/${sent.data.id}`);
  }

  return (
    <form onSubmit={submit} onChange={save.clear} className="grid max-w-5xl gap-8">
      <fieldset disabled={save.submitting} className="grid gap-5 sm:grid-cols-2">
        <legend className="sr-only">Role</legend>
        {editing ? (
          <div className="grid gap-2">
            <span className="text-sm text-muted-foreground">Name</span>
            <span className="font-medium">{role.name}</span>
          </div>
        ) : (
          <Field label="Name" htmlFor="role-name" error={save.fieldErrors.name}>
            <Input id="role-name" name="name" required maxLength={100} placeholder="Registrar" autoFocus />
          </Field>
        )}
        <Field label="Description" htmlFor="role-description" error={save.fieldErrors.description} className="sm:col-span-2">
          <Textarea id="role-description" name="description" defaultValue={role?.description ?? ""} maxLength={255} rows={2} />
        </Field>
      </fieldset>

      {role?.shared && (
        <Alert tone="default" title="Shared role">
          Saving gives this campus its own copy of {role.name} and moves its holders here onto it.
        </Alert>
      )}
      {beyond.length > 0 && (
        <Alert tone="warning" icon={ShieldAlert} title={`It holds ${beyond.length} permission${beyond.length === 1 ? "" : "s"} you do not hold`}>
          You can only save a role holding nothing beyond your own permissions. Ask someone who holds them, or copy the role
          (the copy keeps only what you hold).
        </Alert>
      )}

      <section className="grid gap-4" aria-labelledby="form-permissions">
        <SectionHeading title="Permissions" id="form-permissions" />
        <Loaded query={grantable.query}>
          {() => <PermissionsMatrix value={permissions} onChange={setPermissions} grantable={grantable.set} />}
        </Loaded>
        {save.fieldErrors.permissions && <p className="text-sm text-destructive">{save.fieldErrors.permissions}</p>}
      </section>

      <FormError error={save.error} fields={["name", "description", "permissions"]} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={save.submitting || !grantable.ready || beyond.length > 0}>
          {save.submitting ? "Saving…" : editing ? "Save role" : "Create role"}
        </Button>
        <ButtonLink href={role ? `/roles/${role.id}` : "/roles"} variant="outline">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}
