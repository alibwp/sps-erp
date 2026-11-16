"use client";

import { Ellipsis, ShieldCheck, UserMinus, Users } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/session";
import { FormError, Loaded } from "@/components/ui/api-states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Field, Input } from "@/components/ui/form";
import { Avatar, EmptyState } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { DELEGABLE_PERMISSIONS, orgApi, orgCan, type OrganizationDto, type OrgMember } from "@/lib/organizations";
import { useApiMutation, useApiQuery } from "@/lib/use-api";
import { formatDate } from "@/lib/utils";

const permissionLabel = (value: string) => DELEGABLE_PERMISSIONS.find((item) => item.value === value)?.label ?? value;

/**
 * The people who administer an organization ("manage organization members").
 * Members get organization scope only; their campus access is a separate
 * matter and does not change here.
 */
export function MembersPanel({ organization }: { organization: OrganizationDto }) {
  const toast = useToast();
  const session = useAuth();
  const myId = session.status === "signed-in" ? session.user.id : null;
  const members = useApiQuery<OrgMember[]>(orgApi.members(organization.id), { keepPrevious: true });

  const grant = useApiMutation();
  const removal = useApiMutation();
  const [email, setEmail] = useState("");
  const [editing, setEditing] = useState<OrgMember | null>(null);
  const [removing, setRemoving] = useState<OrgMember | null>(null);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sent = await grant.send<OrgMember>(orgApi.members(organization.id), { method: "POST", body: { email: email.trim() } });
    if (!sent.ok) return;
    setEmail("");
    members.reload();
    toast({ title: "Member added", description: `${sent.data.name} now administers ${organization.name}.` });
  }

  async function remove(member: OrgMember) {
    const sent = await removal.send(orgApi.member(organization.id, member.userId), { method: "DELETE" });
    if (!sent.ok) {
      toast({ title: "Could not remove the member", description: sent.error.message, tone: "error" });
      return;
    }
    members.reload();
    toast({ title: "Member removed", description: `${member.name} no longer administers ${organization.name}.` });
  }

  return (
    <div className="grid gap-6">
      <form onSubmit={add} className="grid max-w-xl gap-2">
        <div className="flex flex-wrap items-end gap-2">
          <Field
            label="Add a member by email"
            htmlFor="member-email"
            error={grant.fieldErrors.email}
            help="The person must already have an account at one of this organization's campuses. They get the permissions you hold here."
            className="min-w-60 flex-1"
          >
            <Input
              id="member-email"
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                grant.clear();
              }}
              required
              maxLength={100}
              placeholder="head@school.edu"
              disabled={grant.submitting}
            />
          </Field>
          <Button type="submit" disabled={grant.submitting || email.trim() === ""}>
            {grant.submitting ? "Adding…" : "Add member"}
          </Button>
        </div>
        <FormError error={grant.error} fields={["email"]} />
      </form>

      <Loaded query={members}>
        {(data) =>
          data.length === 0 ? (
            <EmptyState icon={Users} title="No members" description="Nobody administers this organization yet." />
          ) : (
            <Table busy={members.loading}>
              <THead>
                <TH>Member</TH>
                <TH>May</TH>
                <TH>Joined</TH>
                <TH className="text-right">
                  <span className="sr-only">Actions</span>
                </TH>
              </THead>
              <tbody>
                {data.map((member) => (
                  <TR key={member.userId}>
                    <TD>
                      <div className="flex items-center gap-3">
                        <Avatar name={member.name} size="sm" />
                        <div className="min-w-0">
                          <span className="block font-medium">
                            {member.name}
                            {member.userId === myId && <span className="font-normal text-muted-foreground"> (you)</span>}
                          </span>
                          <span className="block text-xs text-muted-foreground">{member.email}</span>
                        </div>
                      </div>
                    </TD>
                    <TD>
                      {member.fullAuthority ? (
                        <Badge tone="success">Everything</Badge>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {member.permissions
                            .filter((permission) => DELEGABLE_PERMISSIONS.some((item) => item.value === permission))
                            .map((permission) => (
                              <Badge key={permission}>{permissionLabel(permission)}</Badge>
                            ))}
                          {member.permissions.every((permission) => !DELEGABLE_PERMISSIONS.some((item) => item.value === permission)) && (
                            <span className="text-muted-foreground">Read only</span>
                          )}
                        </div>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap">{formatDate(member.joinedAt)}</TD>
                    <TD className="py-2 text-right">
                      <DropdownMenu
                        trigger={<Ellipsis className="size-4" />}
                        triggerLabel={`Actions for ${member.name}`}
                        triggerClassName="size-9"
                        className="w-52"
                      >
                        <DropdownMenuItem onClick={() => setEditing(member)}>
                          <ShieldCheck /> Permissions
                        </DropdownMenuItem>
                        <DropdownMenuItem destructive onClick={() => setRemoving(member)}>
                          <UserMinus /> Remove
                        </DropdownMenuItem>
                      </DropdownMenu>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )
        }
      </Loaded>

      {editing && (
        <PermissionsDialog
          organization={organization}
          member={editing}
          onClose={() => setEditing(null)}
          onSaved={members.reload}
        />
      )}
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) void remove(removing);
        }}
        title={`Remove ${removing?.name ?? "this member"}?`}
        description="They stop administering the organization. Their access to campuses does not change."
        confirmLabel="Remove"
      />
    </div>
  );
}

/**
 * PUT …/members/:userId/permissions. null means every organization
 * permission. You can only give or take away permissions you hold yourself,
 * so the others are shown but locked.
 */
function PermissionsDialog({
  organization,
  member,
  onClose,
  onSaved,
}: {
  organization: OrganizationDto;
  member: OrgMember;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const save = useApiMutation();
  const [full, setFull] = useState(member.fullAuthority);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(member.permissions));
  const holdsAll = DELEGABLE_PERMISSIONS.every(({ value }) => orgCan(organization, value));

  function toggle(permission: string, on: boolean) {
    setChosen((current) => {
      const next = new Set(current);
      if (on) next.add(permission);
      else next.delete(permission);
      return next;
    });
    save.clear();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const permissions = full ? null : DELEGABLE_PERMISSIONS.map(({ value }) => value).filter((value) => chosen.has(value));
    const sent = await save.send<OrgMember>(`${orgApi.member(organization.id, member.userId)}/permissions`, {
      method: "PUT",
      body: { permissions },
    });
    if (!sent.ok) return;
    onSaved();
    onClose();
    toast({ title: "Permissions saved", description: member.name });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`What ${member.name} may do`}
      description="Reading the organization is always kept."
      className="max-h-[90vh] max-w-xl overflow-y-auto"
    >
      <form onSubmit={submit} className="grid gap-4">
        <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
          <div>
            <p id="full-authority" className="text-sm font-medium">
              Everything
            </p>
            <p className="text-sm text-muted-foreground">
              Every organization permission, including ones added later.
              {!holdsAll && " Only someone who holds every permission can give this."}
            </p>
          </div>
          <Switch
            checked={full}
            onCheckedChange={(next) => {
              setFull(next);
              save.clear();
            }}
            disabled={save.submitting || (!holdsAll && !member.fullAuthority)}
            aria-labelledby="full-authority"
          />
        </div>

        {!full && (
          <fieldset className="grid gap-1" disabled={save.submitting}>
            <legend className="mb-2 text-sm font-medium">Permissions</legend>
            {DELEGABLE_PERMISSIONS.map(({ value, label, description }) => {
              const mine = orgCan(organization, value);
              return (
                <label
                  key={value}
                  className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/40 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4"
                    checked={chosen.has(value)}
                    disabled={!mine}
                    onChange={(event) => toggle(value, event.target.checked)}
                  />
                  <span className="grid gap-0.5">
                    <span className="text-sm">{label}</span>
                    <span className="text-xs text-muted-foreground">
                      {description}
                      {!mine && " You do not hold this, so you cannot change it."}
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>
        )}

        <FormError error={save.error} />
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
