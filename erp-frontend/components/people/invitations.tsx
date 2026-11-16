"use client";

import Link from "next/link";
import { Mail, MailX, Send } from "lucide-react";
import { useCallback, useState } from "react";
import { useWorkingContext } from "@/components/auth/session";
import { Loaded } from "@/components/ui/api-states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/form";
import { Alert, EmptyState } from "@/components/ui/misc";
import { Pagination, SearchBox, Table, TD, TH, THead, TR } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { withQuery, type Paginated } from "@/lib/api";
import { orgApi, orgCan, OrgPermission, type OrganizationDto } from "@/lib/organizations";
import {
  INVITATION_STATUS_LABELS,
  invitationTone,
  peopleApi,
  type Invitation,
  type InvitationStatus,
} from "@/lib/people";
import { useApiMutation, useApiQuery } from "@/lib/use-api";
import { formatDate } from "@/lib/utils";

const PER_PAGE = 20;

/**
 * /account-invitations: the invitations of this campus's people and their
 * state. A pending one can be sent again (a new link; the old one stops) or
 * revoked. With "manage organization members" this uses the organization's
 * invitation routes; otherwise the campus account routes, which do the same
 * for one person under "manage account access".
 */
export function InvitationList() {
  const toast = useToast();
  const { ready, schoolId, campus, can } = useWorkingContext();
  const allowed = can("manage account access");
  const [status, setStatus] = useState<InvitationStatus | "">("pending");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [revoking, setRevoking] = useState<Invitation | null>(null);
  const action = useApiMutation();

  const invitations = useApiQuery<Paginated<Invitation>>(
    schoolId && allowed ? withQuery(peopleApi.invitations, { page, perPage: PER_PAGE, search, status }) : null,
    { keepPrevious: true },
  );
  // Whether the organization's routes are open to this person (a 403 just means no).
  const organizationId = campus?.organization.id ?? null;
  const organization = useApiQuery<OrganizationDto>(organizationId ? orgApi.one(organizationId) : null);
  const viaOrganization = organization.data ? orgCan(organization.data, OrgPermission.ManageMembers) : false;

  const onSearch = useCallback((text: string) => {
    setSearch(text);
    setPage(1);
  }, []);

  async function resend(invitation: Invitation) {
    // The organization route resends a pending invitation only; an expired one gets a fresh invitation.
    const path = viaOrganization && invitation.status === "pending"
      ? `${orgApi.one(organizationId!)}/invitations/${invitation.id}/resend`
      : `${peopleApi.account(invitation.user.id)}/invitation`;
    const sent = await action.send<{ expiresAt: string }>(path, { method: "POST" });
    if (!sent.ok) {
      toast({ title: "Could not send", description: sent.error.message, tone: "error" });
      return;
    }
    invitations.reload();
    toast({ title: `New link emailed to ${invitation.user.name}`, description: `Valid until ${new Date(sent.data.expiresAt).toLocaleString()}.` });
  }

  async function revoke(invitation: Invitation) {
    const sent = viaOrganization
      ? await action.send(`${orgApi.one(organizationId!)}/invitations/${invitation.id}/revoke`, { method: "POST" })
      : await action.send(`${peopleApi.account(invitation.user.id)}/invitation`, { method: "DELETE" });
    if (!sent.ok) {
      toast({ title: "Could not revoke", description: sent.error.message, tone: "error" });
      return;
    }
    invitations.reload();
    toast({ title: `${invitation.user.name}'s invitation revoked` });
  }

  if (ready && !allowed) {
    return (
      <Alert tone="warning" title="You cannot see invitations">
        Invitations of the campus&apos;s people need the “manage account access” permission.
      </Alert>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox label="Search by name or email" onSearch={onSearch} />
        <Select
          className="h-9 w-40"
          aria-label="Invitation status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as InvitationStatus | "");
            setPage(1);
          }}
        >
          <option value="">Every status</option>
          {(Object.keys(INVITATION_STATUS_LABELS) as InvitationStatus[]).map((value) => (
            <option key={value} value={value}>
              {INVITATION_STATUS_LABELS[value]}
            </option>
          ))}
        </Select>
      </div>

      <Loaded query={invitations}>
        {({ data, meta }) =>
          data.length === 0 ? (
            <EmptyState
              icon={Mail}
              title={status === "pending" ? "No pending invitations" : "No invitations"}
              description="Invite someone from their account page, or when adding a person."
            />
          ) : (
            <>
              <Table busy={invitations.loading || action.submitting}>
                <THead>
                  <TH>Person</TH>
                  <TH>Status</TH>
                  <TH>Invited by</TH>
                  <TH>Sent</TH>
                  <TH>Expires / outcome</TH>
                  <TH className="text-right">
                    <span className="sr-only">Actions</span>
                  </TH>
                </THead>
                <tbody>
                  {data.map((invitation) => (
                    <TR key={invitation.id}>
                      <TD>
                        <Link href={`/admins/${invitation.user.id}`} className="block font-medium hover:underline hover:underline-offset-4">
                          {invitation.user.name}
                        </Link>
                        <span className="block text-xs text-muted-foreground">{invitation.user.email}</span>
                      </TD>
                      <TD>
                        <Badge tone={invitationTone(invitation.status)}>{INVITATION_STATUS_LABELS[invitation.status]}</Badge>
                      </TD>
                      <TD>{invitation.invitedBy?.name ?? "—"}</TD>
                      <TD className="whitespace-nowrap">{formatDate(invitation.createdAt)}</TD>
                      <TD className="whitespace-nowrap">
                        {invitation.acceptedAt
                          ? `Accepted ${formatDate(invitation.acceptedAt)}`
                          : invitation.revokedAt
                            ? `Revoked ${formatDate(invitation.revokedAt)}`
                            : `${invitation.status === "expired" ? "Expired" : "Expires"} ${formatDate(invitation.expiresAt)}`}
                      </TD>
                      <TD className="py-2 text-right">
                        {invitation.status === "pending" && (
                          <span className="inline-flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => void resend(invitation)} disabled={action.submitting}>
                              <Send /> Resend
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setRevoking(invitation)} disabled={action.submitting}>
                              <MailX /> Revoke
                            </Button>
                          </span>
                        )}
                        {invitation.status === "expired" && (
                          <Button variant="ghost" size="sm" onClick={() => void resend(invitation)} disabled={action.submitting}>
                            <Send /> Send a new link
                          </Button>
                        )}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
              <Pagination page={meta.page} perPage={meta.perPage} total={meta.total} onPage={setPage} />
            </>
          )
        }
      </Loaded>

      <ConfirmDialog
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        onConfirm={() => {
          if (revoking) void revoke(revoking);
        }}
        title={`Revoke ${revoking?.user.name ?? "this"}'s invitation?`}
        description="Every unused link of theirs stops working. You can invite them again later."
        confirmLabel="Revoke"
      />
    </div>
  );
}
