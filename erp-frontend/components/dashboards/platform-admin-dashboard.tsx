"use client";

import Link from "next/link";
import { ArrowUpRight, Building2, MailPlus, School, TriangleAlert } from "lucide-react";
import { useMemo } from "react";
import { switchCampus, useWorkingContext } from "@/components/auth/session";
import { BackendStatus } from "@/components/backend-status";
import { useAllAccounts } from "@/components/people/accounts";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { SampleBadge } from "@/components/ui/demo";
import { Alert, Avatar, SectionHeading } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { ACTIVITY_LOG, LOG_TONES } from "@/lib/activity-log";
import { withQuery, type Paginated } from "@/lib/api";
import { orgApi, type OrganizationDto, type OrgCampus } from "@/lib/organizations";
import { peopleApi, type Invitation } from "@/lib/people";
import { timeZoneLabel } from "@/lib/time-zones";
import { messageOf, useApiQueries, useApiQuery } from "@/lib/use-api";
import { formatDate, formatNumber } from "@/lib/utils";

// The platform administrator works above any one school: every organization,
// every campus, the people who run them, and the health of the system.
// Organizations, campuses, people, roles and invitations come from the
// backend; the activity log has no backend yet and is marked as sample data.
// Per-campus enrolment is left out: the backend answers it one campus at a
// time, and a dashboard should not show figures it cannot back.

/** Roles whose holders administer something. */
const ADMIN_ROLES = new Set(["platform-admin", "organization-admin", "admin"]);

function SeeAll({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} className="inline-flex min-h-10 select-none items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      {children} <ArrowUpRight className="size-4" />
    </Link>
  );
}

const total = (query: { data?: Paginated<unknown> }) => (query.data ? formatNumber(query.data.meta.total) : null);

export function PlatformAdminDashboard() {
  const toast = useToast();
  const { schoolId, campuses: myCampuses, can } = useWorkingContext();

  const organizations = useApiQuery<Paginated<OrganizationDto>>(`${orgApi.list}?perPage=100`, { keepPrevious: true });
  const orgList = useMemo(() => organizations.data?.data ?? [], [organizations.data]);
  const campusPages = useApiQueries<Paginated<OrgCampus>>(
    organizations.data ? orgList.map((organization) => `${orgApi.campuses(organization.id)}?perPage=100`) : null,
  );
  const campuses = useMemo(
    () =>
      orgList.flatMap((organization, index) =>
        (campusPages.data?.[index]?.data ?? []).map((campus) => ({ campus, organization })),
      ),
    [orgList, campusPages.data],
  );

  const manageAccess = Boolean(schoolId) && can("manage account access");
  const people = useApiQuery<Paginated<unknown>>(manageAccess ? withQuery(peopleApi.accounts, { perPage: 1 }) : null);
  const roles = useApiQuery<Paginated<unknown>>(schoolId && can("read role") ? withQuery(peopleApi.roles, { archived: "false", perPage: 1 }) : null);
  const pending = useApiQuery<Paginated<Invitation>>(
    manageAccess ? withQuery(peopleApi.invitations, { status: "pending", perPage: 5 }) : null,
    { keepPrevious: true },
  );
  const accounts = useAllAccounts();
  const admins = (accounts.data ?? []).filter((account) => account.roles.some((role) => ADMIN_ROLES.has(role.name)));

  const needsSetup = campuses.filter(({ campus }) => !campus.setupDetailsCompletedAt);
  const campusesLoaded = campusPages.data !== undefined || orgList.length === 0;
  const recentActivity = ACTIVITY_LOG.slice(0, 6);

  const snapshot: Array<{ label: string; value: string | null; href: string }> = [
    { label: "Organizations", value: organizations.data ? formatNumber(organizations.data.meta.total) : null, href: "/organizations" },
    { label: "Campuses", value: campusesLoaded && organizations.data ? formatNumber(campuses.length) : null, href: "/schools" },
    ...(manageAccess
      ? [
          { label: "People at this campus", value: total(people), href: "/admins" },
          { label: "Pending invitations", value: total(pending), href: "/account-invitations" },
        ]
      : []),
    ...(can("read role") ? [{ label: "Roles offered", value: total(roles), href: "/roles" }] : []),
  ];

  async function workAt(campus: OrgCampus) {
    try {
      await switchCampus(campus.id);
      toast({ title: "Working campus changed", description: campus.name });
    } catch (error) {
      toast({ title: "Could not open the campus", description: messageOf(error), tone: "error" });
    }
  }

  return (
    <div className="space-y-10">
      <section className="flex flex-col gap-4 border-b pb-6 md:flex-row md:items-end md:justify-between" aria-labelledby="platform-heading">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Platform administrator</p>
          <h2 id="platform-heading" className="mt-1 text-xl font-semibold tracking-tight">
            Every organization and campus at a glance
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Open a campus to work inside it.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ButtonLink href="/organizations/create" variant="outline">
            <Building2 /> Add organization
          </ButtonLink>
          <ButtonLink href="/schools?new=1" variant="outline">
            <School /> Add campus
          </ButtonLink>
          {manageAccess && (
            <ButtonLink href="/admins/create">
              <MailPlus /> Invite someone
            </ButtonLink>
          )}
        </div>
      </section>

      {organizations.error && <Alert tone="destructive">{organizations.error.message}</Alert>}

      {needsSetup.length > 0 && (
        <Alert
          tone="warning"
          icon={TriangleAlert}
          title={`${needsSetup.length} ${needsSetup.length === 1 ? "campus needs" : "campuses need"} its details completed`}
        >
          {needsSetup.slice(0, 6).map(({ campus, organization }, index) => (
            <span key={campus.id}>
              {index > 0 && ", "}
              <Link href={`/schools?org=${organization.id}`} className="font-medium text-foreground underline-offset-4 hover:underline">
                {campus.name}
              </Link>
            </span>
          ))}
          {needsSetup.length > 6 && ` and ${needsSetup.length - 6} more`}.
        </Alert>
      )}

      <section aria-label="Platform snapshot">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 xl:grid-cols-5">
          {snapshot.map((stat) => (
            <Link key={stat.label} href={stat.href} className="group flex min-h-11 select-none flex-col-reverse justify-end">
              <dt className="truncate text-sm text-muted-foreground group-hover:text-foreground">{stat.label}</dt>
              <dd className="text-2xl font-semibold tabular-nums">
                {stat.value ?? <span className="inline-block h-7 w-12 animate-pulse rounded bg-muted align-middle" aria-label="Loading" />}
              </dd>
            </Link>
          ))}
        </dl>
      </section>

      <section className="min-w-0" aria-labelledby="campus-health">
        <SectionHeading title="Campuses" id="campus-health">
          <SeeAll href="/schools">All campuses</SeeAll>
        </SectionHeading>
        {campusPages.error ? (
          <Alert tone="destructive">{campusPages.error.message}</Alert>
        ) : !campusesLoaded ? (
          <p className="py-4 text-sm text-muted-foreground">Loading campuses…</p>
        ) : campuses.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No campuses yet. Add one to an organization.</p>
        ) : (
          <div className="beautify-scrollbar relative max-w-full overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <caption className="sr-only">Every campus, its organization and whether its details are complete</caption>
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th scope="col" className="py-3 pr-4 font-medium">Campus</th>
                  <th scope="col" className="px-4 py-3 font-medium">Location</th>
                  <th scope="col" className="px-4 py-3 font-medium">Time zone</th>
                  <th scope="col" className="px-4 py-3 font-medium">Details</th>
                  <th scope="col" className="py-3 pl-4"><span className="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody>
                {campuses.map(({ campus, organization }) => {
                  const mine = myCampuses.some((item) => item.id === campus.id);
                  return (
                    <tr key={campus.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="py-3 pr-4">
                        <span className="block font-medium">{campus.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {organization.name} · <span className="font-mono">{campus.code}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3">{[campus.city, campus.country].filter(Boolean).join(", ") || "—"}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{timeZoneLabel(campus.timezone)}</td>
                      <td className="px-4 py-3">
                        {campus.setupDetailsCompletedAt ? <Badge tone="success">Complete</Badge> : <Badge tone="warning">Setup needed</Badge>}
                      </td>
                      <td className="py-2 pl-4 text-right">
                        {campus.id === schoolId ? (
                          <span className="text-xs text-muted-foreground">Working here</span>
                        ) : mine ? (
                          <Button variant="ghost" size="sm" onClick={() => void workAt(campus)}>
                            Work here <span aria-hidden>→</span>
                            <span className="sr-only">{campus.name}</span>
                          </Button>
                        ) : (
                          <Link href={`/schools?org=${organization.id}`} className="text-sm font-medium underline-offset-4 hover:underline">
                            View
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-10 lg:grid-cols-2">
        <section className="min-w-0" aria-labelledby="organizations-overview">
          <SectionHeading title="Organizations" id="organizations-overview">
            <SeeAll href="/organizations">All organizations</SeeAll>
          </SectionHeading>
          {orgList.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">{organizations.data ? "No organizations yet." : "Loading…"}</p>
          ) : (
            <ul className="divide-y">
              {orgList.map((organization, index) => {
                const count = campusPages.data?.[index]?.meta.total;
                return (
                  <li key={organization.id}>
                    <Link href={`/organizations/${organization.id}`} className="flex min-h-14 items-center justify-between gap-4 py-2 hover:bg-muted/40">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{organization.name}</span>
                        <span className="block font-mono text-xs text-muted-foreground">{organization.code}</span>
                      </span>
                      <span className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                        {count === undefined ? "…" : `${count} ${count === 1 ? "campus" : "campuses"}`}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {manageAccess && (
          <section className="min-w-0" aria-labelledby="invitations-overview">
            <SectionHeading title="Waiting on an invitation" id="invitations-overview">
              <SeeAll href="/account-invitations">All invitations</SeeAll>
            </SectionHeading>
            {!pending.data ? (
              <p className="py-4 text-sm text-muted-foreground">{pending.error ? pending.error.message : "Loading…"}</p>
            ) : pending.data.data.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">Nobody at this campus is waiting to set up an account.</p>
            ) : (
              <ul className="divide-y">
                {pending.data.data.map((invitation) => (
                  <li key={invitation.id}>
                    <Link href={`/admins/${invitation.user.id}`} className="flex min-h-14 items-center justify-between gap-4 py-2 hover:bg-muted/40">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{invitation.user.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{invitation.user.email}</span>
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">Expires {formatDate(invitation.expiresAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section className="min-w-0" aria-labelledby="activity-overview">
          <SectionHeading title="Recent activity" id="activity-overview">
            <span className="flex items-center gap-2">
              <SampleBadge />
              <SeeAll href="/activity-logs">Activity logs</SeeAll>
            </span>
          </SectionHeading>
          <ul className="divide-y">
            {recentActivity.map((entry, index) => (
              <li key={index} className="grid min-h-11 grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-3 py-2">
                <Badge tone={LOG_TONES[entry.level]} className="justify-self-start">
                  {entry.level}
                </Badge>
                <span className="min-w-0">
                  <span className="block break-words text-sm">{entry.message}</span>
                  <span className="block text-xs tabular-nums text-muted-foreground">
                    {formatDate(entry.date)} · {entry.time}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        {manageAccess && (
          <section className="min-w-0" aria-labelledby="admins-overview">
            <SectionHeading title="Administrators at this campus" id="admins-overview">
              <SeeAll href="/admins">Manage</SeeAll>
            </SectionHeading>
            {!accounts.data ? (
              <p className="py-4 text-sm text-muted-foreground">{accounts.error ? accounts.error.message : "Loading…"}</p>
            ) : admins.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">Nobody here holds an administrator role.</p>
            ) : (
              <ul className="divide-y">
                {admins.slice(0, 8).map((admin) => (
                  <li key={admin.id}>
                    <Link href={`/admins/${admin.id}`} className="flex min-h-14 items-center gap-3 py-2 hover:bg-muted/40">
                      <Avatar name={admin.name} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{admin.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {admin.roles
                            .filter((role) => ADMIN_ROLES.has(role.name))
                            .map((role) => role.name)
                            .join(", ")}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">Joined {formatDate(admin.membership.joinedAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      <section className="min-w-0 space-y-4" aria-labelledby="system-health">
        <SectionHeading title="System health" id="system-health" />
        <BackendStatus />
      </section>
    </div>
  );
}
