"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, LogOut, Mail, MailX, Plus, ShieldAlert, ShieldCheck, UserCog, Users, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { authorizedApi, useWorkingContext } from "@/components/auth/session";
import { CLEARABLE, PersonFields } from "@/components/students/students";
import { Page } from "@/components/layout/page-header";
import { FormError, Loaded } from "@/components/ui/api-states";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Select, Textarea } from "@/components/ui/form";
import { Alert, Avatar, EmptyState, SectionHeading } from "@/components/ui/misc";
import { Pagination, SearchBox, Table, TD, TH, THead, TR } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { withQuery, type Paginated } from "@/lib/api";
import {
  ACCOUNT_STATUS_LABELS,
  accountTone,
  NOT_GIVEN_HERE,
  peopleApi,
  STATUS_ACTION_LABELS,
  STATUS_ACTIONS,
  type Account,
  type AccountDetail,
  type AccountStatus,
  type HeldRole,
  type Role,
  type StatusAction,
} from "@/lib/people";
import { PERSON_FIELDS } from "@/lib/teaching";
import { toApiError, useApiMutation, useApiQuery, type ApiQuery } from "@/lib/use-api";
import { formatDate } from "@/lib/utils";

const PER_PAGE = 20;

export function AccountBadge({ status }: { status: string }) {
  return <Badge tone={accountTone(status)}>{ACCOUNT_STATUS_LABELS[status as AccountStatus] ?? status}</Badge>;
}

export function RoleChips({ roles }: { roles: HeldRole[] }) {
  if (roles.length === 0) return <span className="text-muted-foreground">No role</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {roles.map((role) => (
        <Badge key={role.id} tone={role.global ? "info" : "neutral"}>
          {role.name}
        </Badge>
      ))}
    </span>
  );
}

function NoAccess() {
  return (
    <Alert tone="warning" icon={ShieldAlert} title="You cannot manage accounts">
      Seeing and managing the people of the campus needs the “manage account access” permission.
    </Alert>
  );
}

/**
 * Every account of the campus, read page by page. The account list has no
 * role filter, so the teacher and parent lists filter what this returns.
 */
export function useAllAccounts(): ApiQuery<Account[]> {
  const { schoolId, can } = useWorkingContext();
  const enabled = Boolean(schoolId) && can("manage account access");
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{ key: string; data?: Account[]; error: ReturnType<typeof toApiError> | null } | null>(null);
  const key = enabled ? `${schoolId}|${version}` : null;

  useEffect(() => {
    if (!key) return;
    let current = true;
    (async () => {
      const first = await authorizedApi<Paginated<Account>>(withQuery(peopleApi.accounts, { page: 1, perPage: 100 }));
      const pages = Math.ceil(first.meta.total / 100);
      const rest = await Promise.all(
        Array.from({ length: Math.max(0, pages - 1) }, (_, index) =>
          authorizedApi<Paginated<Account>>(withQuery(peopleApi.accounts, { page: index + 2, perPage: 100 })),
        ),
      );
      return [first, ...rest].flatMap((page) => page.data);
    })().then(
      (data) => current && setState({ key, data, error: null }),
      (error: unknown) => current && setState({ key, error: toApiError(error) }),
    );
    return () => {
      current = false;
    };
  }, [key]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);
  const fresh = state?.key === key ? state : null;
  return { data: fresh?.data ?? state?.data, error: fresh?.error ?? null, loading: key !== null && fresh === null, reload };
}

// ---------------------------------------------------------------- 9.3 List

/** "Add person", for "manage account access". */
export function AddPersonButton({ href = "/admins/create", label = "Add person" }: { href?: string; label?: string }) {
  const { can } = useWorkingContext();
  if (!can("manage account access")) return null;
  return (
    <ButtonLink href={href}>
      <Plus /> {label}
    </ButtonLink>
  );
}

/** /admins: the people with a membership at this campus. */
export function AccountList() {
  const { ready, schoolId, can } = useWorkingContext();
  const allowed = can("manage account access");
  const [status, setStatus] = useState<AccountStatus | "">("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const accounts = useApiQuery<Paginated<Account>>(
    schoolId && allowed ? withQuery(peopleApi.accounts, { page, perPage: PER_PAGE, search, accountStatus: status }) : null,
    { keepPrevious: true },
  );
  const onSearch = useCallback((text: string) => {
    setSearch(text);
    setPage(1);
  }, []);

  if (ready && !allowed) return <NoAccess />;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox label="Search by name or email" onSearch={onSearch} />
        <Select
          className="h-9 w-40"
          aria-label="Account status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as AccountStatus | "");
            setPage(1);
          }}
        >
          <option value="">Every status</option>
          {(Object.keys(ACCOUNT_STATUS_LABELS) as AccountStatus[]).map((value) => (
            <option key={value} value={value}>
              {ACCOUNT_STATUS_LABELS[value]}
            </option>
          ))}
        </Select>
      </div>
      <Loaded query={accounts}>
        {({ data, meta }) =>
          data.length === 0 ? (
            <EmptyState icon={Users} title={search ? "Nobody matches" : "No accounts"} />
          ) : (
            <>
              <AccountTable accounts={data} busy={accounts.loading} />
              <Pagination page={meta.page} perPage={meta.perPage} total={meta.total} onPage={setPage} />
            </>
          )
        }
      </Loaded>
    </div>
  );
}

/** The account table the account, teacher and parent lists share. */
export function AccountTable({ accounts, busy, showRoles = true }: { accounts: Account[]; busy?: boolean; showRoles?: boolean }) {
  return (
    <Table busy={busy}>
      <THead>
        <TH>Person</TH>
        {showRoles && <TH>Roles here</TH>}
        <TH>Account</TH>
        <TH>Joined</TH>
      </THead>
      <tbody>
        {accounts.map((account) => (
          <TR key={account.id}>
            <TD>
              <div className="flex items-center gap-3">
                <Avatar name={account.name} size="sm" />
                <div className="min-w-0">
                  <Link href={`/admins/${account.id}`} className="block font-medium hover:underline hover:underline-offset-4">
                    {account.name}
                  </Link>
                  <span className="block truncate text-xs text-muted-foreground">{account.email}</span>
                </div>
              </div>
            </TD>
            {showRoles && (
              <TD>
                <RoleChips roles={account.roles} />
              </TD>
            )}
            <TD>
              <span className="flex flex-wrap items-center gap-1.5">
                <AccountBadge status={account.accountStatus} />
                {account.twoFactorEnabled && <Badge tone="success">2FA</Badge>}
              </span>
            </TD>
            <TD className="whitespace-nowrap">{formatDate(account.membership.joinedAt)}</TD>
          </TR>
        ))}
      </tbody>
    </Table>
  );
}

// ---------------------------------------------------------------- Add a person

/** Roles this person may give here: offered, not platform/student/parent, not held already. */
function useGivableRoles(held: HeldRole[] = []) {
  const { can } = useWorkingContext();
  const query = useApiQuery<Paginated<Role>>(can("manage role") ? withQuery(peopleApi.roles, { archived: "false", perPage: 100 }) : null);
  const roles = useMemo(
    () =>
      (query.data?.data ?? [])
        .filter((role) => !NOT_GIVEN_HERE.has(role.name) && !held.some((item) => item.id === role.id))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [query.data, held],
  );
  return { query, roles };
}

/**
 * /admins/create (and /teachers/create): POST /v1/accounts provisions the
 * account; a role and the invitation follow when asked for. A person the
 * organization already knows keeps their profile (only blank fields fill).
 */
export function AddPerson({ presetRole, backHref = "/admins", backLabel = "Accounts" }: { presetRole?: string; backHref?: string; backLabel?: string }) {
  const router = useRouter();
  const toast = useToast();
  const { ready, can } = useWorkingContext();
  const save = useApiMutation();
  const { roles } = useGivableRoles();
  const [roleId, setRoleId] = useState<string | null>(null);
  const [invite, setInvite] = useState(true);
  const preset = roles.find((role) => role.name === presetRole);
  const chosenRole = roleId ?? preset?.id ?? "";
  const title = presetRole ? `Add ${presetRole}` : "Add person";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "").trim();
    const body = Object.fromEntries(PERSON_FIELDS.map((field) => [field, CLEARABLE.has(field) ? text(field) || null : text(field)]));

    const sent = await save.send<AccountDetail>(peopleApi.accounts, { method: "POST", body });
    if (!sent.ok) return;
    const account = sent.data;
    const notes: string[] = [];
    // The account exists now; a failed follow-up is reported, not undone.
    if (chosenRole) {
      try {
        await authorizedApi(`${peopleApi.account(account.id)}/roles`, { method: "POST", body: { roleId: chosenRole } });
        notes.push(`given ${roles.find((role) => role.id === chosenRole)?.name ?? "the role"}`);
      } catch (error) {
        toast({ title: "The role was not given", description: toApiError(error).message, tone: "error" });
      }
    }
    if (invite && account.accountStatus === "invited") {
      try {
        await authorizedApi(`${peopleApi.account(account.id)}/invitation`, { method: "POST" });
        notes.push("invitation emailed");
      } catch (error) {
        toast({ title: "The invitation was not sent", description: toApiError(error).message, tone: "error" });
      }
    }
    toast({ title: `${account.name} added`, description: notes.length ? `${notes.join(", ")}.` : undefined });
    router.push(`/admins/${account.id}`);
  }

  return (
    <Page title={title} breadcrumbs={[{ label: backLabel, href: backHref }, { label: title }]}>
      {ready && !can("manage account access") ? (
        <NoAccess />
      ) : (
        <form onSubmit={submit} onChange={save.clear} className="grid max-w-3xl gap-8">
          <fieldset disabled={save.submitting} className="grid gap-5 sm:grid-cols-2">
            <legend className="mb-4 text-lg font-medium">Personal details</legend>
            <PersonFields errors={save.fieldErrors} emailHelp="Someone the organization already knows keeps their profile; only blank fields are filled." />
          </fieldset>
          <fieldset disabled={save.submitting} className="grid gap-4">
            <legend className="mb-4 text-lg font-medium">Access</legend>
            {can("manage role") && (
              <Field label="Role at this campus" htmlFor="person-role" help="Staff roles only: students are admitted from Students.">
                <Select id="person-role" value={chosenRole} onChange={(event) => setRoleId(event.target.value)}>
                  <option value="">No role yet</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-0.5 size-4" checked={invite} onChange={(event) => setInvite(event.target.checked)} />
              <span>
                <span className="block font-medium">Email an invitation now</span>
                <span className="text-muted-foreground">A new person sets their password from the link.</span>
              </span>
            </label>
          </fieldset>
          <FormError error={save.error} fields={PERSON_FIELDS} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={save.submitting}>
              {save.submitting ? "Adding…" : title}
            </Button>
            <ButtonLink href={backHref} variant="outline">
              Cancel
            </ButtonLink>
          </div>
        </form>
      )}
    </Page>
  );
}

// ---------------------------------------------------------------- 9.3–9.5 One account

type Dialogs = { kind: "status"; action: StatusAction } | { kind: "end" } | { kind: "cancel-invite" } | { kind: "remove-role"; role: HeldRole } | null;

/** /admins/[id]: a person's profile, roles here, account status, invitation and membership. */
export function AccountDetailScreen({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const { ready, can } = useWorkingContext();
  const account = useApiQuery<AccountDetail>(can("manage account access") ? peopleApi.account(id) : null, { keepPrevious: true });
  const action = useApiMutation();
  const [dialog, setDialog] = useState<Dialogs>(null);
  const data = account.data;
  const name = data?.name ?? "Account";

  async function sendInvitation() {
    const sent = await action.send<{ expiresAt: string }>(`${peopleApi.account(id)}/invitation`, { method: "POST" });
    if (!sent.ok) {
      toast({ title: "Could not send the invitation", description: sent.error.message, tone: "error" });
      return;
    }
    account.reload();
    toast({ title: "Invitation emailed", description: `The link works until ${new Date(sent.data.expiresAt).toLocaleString()}. Earlier links stop working.` });
  }

  async function cancelInvitations() {
    const sent = await action.send(`${peopleApi.account(id)}/invitation`, { method: "DELETE" });
    if (!sent.ok) {
      toast({ title: "Could not cancel", description: sent.error.message, tone: "error" });
      return;
    }
    account.reload();
    toast({ title: "Invitation links stopped" });
  }

  async function endMembership() {
    const sent = await action.send(`${peopleApi.account(id)}/membership/end`, { method: "POST" });
    if (!sent.ok) {
      toast({ title: "Could not end the membership", description: sent.error.message, tone: "error" });
      return;
    }
    toast({ title: `${name} no longer has access to this campus`, description: "The account, records and history stay." });
    router.push("/admins");
  }

  async function removeRole(role: HeldRole) {
    const sent = await action.send(`${peopleApi.account(id)}/roles/${role.id}`, { method: "DELETE" });
    if (!sent.ok) {
      toast({ title: `Could not take ${role.name} away`, description: sent.error.message, tone: "error" });
      return;
    }
    account.reload();
    toast({ title: `${role.name} taken away` });
  }

  return (
    <Page
      title={
        <span className="flex flex-wrap items-center gap-3">
          {name}
          {data && <AccountBadge status={data.accountStatus} />}
        </span>
      }
      breadcrumbs={[{ label: "Accounts", href: "/admins" }, { label: name }]}
    >
      {ready && !can("manage account access") ? (
        <NoAccess />
      ) : (
        <Loaded query={account}>
          {(detail) => (
            <div className="grid gap-10">
              <Profile account={detail} />
              <RolesSection
                account={detail}
                busy={action.submitting}
                onGiven={account.reload}
                onRemove={(role) => setDialog({ kind: "remove-role", role })}
              />
              <section className="grid gap-4" aria-labelledby="access-heading">
                <SectionHeading title="Access" id="access-heading" />
                <div className="grid gap-4 lg:grid-cols-3">
                  <AccessCard title="Account" description={statusText(detail)}>
                    {STATUS_ACTIONS[detail.accountStatus].map((item) => (
                      <Button
                        key={item}
                        variant={item === "archive" ? "destructive" : "outline"}
                        size="sm"
                        onClick={() => setDialog({ kind: "status", action: item })}
                        disabled={action.submitting}
                      >
                        {item === "suspend" ? <Ban /> : item === "reinstate" ? <ShieldCheck /> : <UserCog />}
                        {STATUS_ACTION_LABELS[item]}
                      </Button>
                    ))}
                    <AccountCardHint account={detail} />
                  </AccessCard>
                  <AccessCard
                    title="Invitation"
                    description={
                      detail.accountStatus === "invited"
                        ? "They have not set a password yet. A new link stops the earlier ones."
                        : "They can already sign in. An invitation is only for people who have not set a password."
                    }
                  >
                    {detail.accountStatus === "invited" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => void sendInvitation()} disabled={action.submitting}>
                          <Mail /> Send invitation
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "cancel-invite" })} disabled={action.submitting}>
                          <MailX /> Cancel links
                        </Button>
                      </>
                    )}
                  </AccessCard>
                  <AccessCard title="Membership of this campus" description={`Joined ${formatDate(detail.membership.joinedAt)}${detail.membership.isPrimary ? " · primary campus" : ""}.`}>
                    <Button size="sm" variant="destructive" onClick={() => setDialog({ kind: "end" })} disabled={action.submitting}>
                      <LogOut /> End membership
                    </Button>
                  </AccessCard>
                </div>
              </section>
            </div>
          )}
        </Loaded>
      )}

      {dialog?.kind === "status" && data && (
        <StatusDialog account={data} action={dialog.action} onClose={() => setDialog(null)} onDone={account.reload} />
      )}
      <ConfirmDialog
        open={dialog?.kind === "cancel-invite"}
        onClose={() => setDialog(null)}
        onConfirm={() => void cancelInvitations()}
        title="Stop every unused invitation link?"
        description="They cannot set a password until you send a new invitation."
        confirmLabel="Stop links"
      />
      <ConfirmDialog
        open={dialog?.kind === "end"}
        onClose={() => setDialog(null)}
        onConfirm={() => void endMembership()}
        title={`End ${name}'s access to this campus?`}
        description="The account, their records and the history stay. Refused when nobody left here could manage roles."
        confirmLabel="End membership"
      />
      <ConfirmDialog
        open={dialog?.kind === "remove-role"}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          if (dialog?.kind === "remove-role") void removeRole(dialog.role);
        }}
        title={`Take ${dialog?.kind === "remove-role" ? dialog.role.name : "this role"} away from ${name}?`}
        description="They lose what the role allows at this campus straight away."
        confirmLabel="Take away"
      />
    </Page>
  );
}

function statusText(account: AccountDetail): string {
  switch (account.accountStatus) {
    case "invited":
      return "Invited: waiting for them to set a password.";
    case "active":
      return `Active${account.emailVerifiedAt ? "" : ", email not verified yet"}${account.twoFactorEnabled ? ", two-factor on" : ""}.`;
    case "suspended":
      return "Suspended: they cannot sign in.";
    default:
      return "Archived: they cannot sign in or be invited.";
  }
}

function AccountCardHint({ account }: { account: AccountDetail }) {
  if (account.accountStatus !== "active" && account.accountStatus !== "invited") return null;
  return <p className="w-full text-xs text-muted-foreground">Suspending or archiving ends their sessions and pending invitations at once.</p>;
}

function AccessCard({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return (
    <div className="grid content-start gap-3 rounded-lg border p-4">
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Profile({ account }: { account: AccountDetail }) {
  const address = [account.address, account.addressLine2, account.city, account.state, account.postalCode, account.country].filter(Boolean).join(", ");
  const facts: Array<[string, string]> = [
    ["Email", account.email],
    ["Phone", account.phone ?? "—"],
    ["Date of birth", formatDate(account.birthday)],
    ["Gender", account.gender ?? "—"],
    ["Nationality", account.nationality ?? "—"],
    ["Address", address || "—"],
    ["Email verified", account.emailVerifiedAt ? formatDate(account.emailVerifiedAt) : "Not yet"],
    ["Account created", formatDate(account.createdAt)],
  ];
  return (
    <div className="grid gap-8 lg:grid-cols-[auto_minmax(0,1fr)]">
      <Avatar name={account.name} src={account.profilePhotoUrl} size="xl" />
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
        {facts.map(([label, value]) => (
          <div key={label} className="grid gap-1">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="text-sm">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ---------------------------------------------------------------- 9.4 Roles on an account

function RolesSection({
  account,
  busy,
  onGiven,
  onRemove,
}: {
  account: AccountDetail;
  busy: boolean;
  onGiven: () => void;
  onRemove: (role: HeldRole) => void;
}) {
  const toast = useToast();
  const { can } = useWorkingContext();
  const manage = can("manage role");
  const give = useApiMutation();
  const { roles } = useGivableRoles(account.roles);
  const [roleId, setRoleId] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sent = await give.send<{ roles: HeldRole[] }>(`${peopleApi.account(account.id)}/roles`, { method: "POST", body: { roleId } });
    if (!sent.ok) return;
    setRoleId("");
    onGiven();
    toast({ title: `${roles.find((role) => role.id === roleId)?.name ?? "Role"} given` });
  }

  return (
    <section className="grid gap-4" aria-labelledby="roles-heading">
      <SectionHeading title="Roles here" id="roles-heading" />
      {account.roles.length === 0 ? (
        <p className="text-sm text-muted-foreground">No role at this campus.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {account.roles.map((role) => (
            <li key={role.id} className="inline-flex items-center gap-1.5 rounded-md border py-1 pl-2.5 pr-1 text-sm">
              <Link href={`/roles/${role.id}`} className="hover:underline hover:underline-offset-4">
                {role.name}
              </Link>
              {role.global && <Badge tone="info">Every campus</Badge>}
              {manage && !role.global && !NOT_GIVEN_HERE.has(role.name) ? (
                <button
                  type="button"
                  className="inline-flex size-6 items-center justify-center rounded hover:bg-muted"
                  aria-label={`Take ${role.name} away`}
                  onClick={() => onRemove(role)}
                  disabled={busy}
                >
                  <X className="size-3.5" />
                </button>
              ) : (
                <span className="w-1" />
              )}
            </li>
          ))}
        </ul>
      )}
      {manage && (
        <form onSubmit={submit} className="grid max-w-xl gap-2">
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Give a role" htmlFor="give-role" error={give.fieldErrors.roleId} className="min-w-60 flex-1">
              <Select id="give-role" value={roleId} onChange={(event) => setRoleId(event.target.value)} disabled={give.submitting}>
                <option value="">{roles.length === 0 ? "No other role to give" : "Choose a role"}</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" disabled={!roleId || give.submitting}>
              {give.submitting ? "Giving…" : "Give"}
            </Button>
          </div>
          <FormError error={give.error} fields={["roleId"]} />
          <p className="text-xs text-muted-foreground">Only roles holding nothing beyond your own permissions can be given.</p>
        </form>
      )}
    </section>
  );
}

/** POST /v1/accounts/:id/status-changes: suspend, reinstate or archive, with an optional reason. */
function StatusDialog({ account, action, onClose, onDone }: { account: AccountDetail; action: StatusAction; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const save = useApiMutation();
  const label = STATUS_ACTION_LABELS[action];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = String(new FormData(event.currentTarget).get("reason") ?? "").trim() || null;
    const sent = await save.send<AccountDetail>(`${peopleApi.account(account.id)}/status-changes`, { method: "POST", body: { action, reason } });
    if (!sent.ok) return;
    onDone();
    onClose();
    toast({ title: `${account.name} is now ${ACCOUNT_STATUS_LABELS[sent.data.accountStatus].toLowerCase()}` });
  }

  const descriptions: Record<StatusAction, string> = {
    suspend: "They are signed out everywhere and cannot sign in. Pending invitations stop.",
    reinstate: "Back to active, or to invited if they never set a password.",
    archive: "They are signed out everywhere and can no longer be invited. Their records stay.",
  };

  return (
    <Dialog open onClose={onClose} title={`${label} ${account.name}?`} description={descriptions[action]}>
      <form onSubmit={submit} className="grid gap-4">
        <Field label="Reason (optional)" htmlFor="account-reason" error={save.fieldErrors.reason}>
          <Textarea id="account-reason" name="reason" maxLength={255} rows={2} disabled={save.submitting} />
        </Field>
        <FormError error={save.error} fields={["reason"]} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={save.submitting}>
            Cancel
          </Button>
          <Button type="submit" variant={action === "reinstate" ? "default" : "destructive"} disabled={save.submitting}>
            {save.submitting ? "Saving…" : label}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
