import Link from "next/link";
import { ArrowUpRight, Building2, MailPlus, School, TriangleAlert } from "lucide-react";
import { BackendStatus } from "@/components/backend-status";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Alert, Avatar, SectionHeading } from "@/components/ui/misc";
import { ACTIVITY_LOG, LOG_TONES } from "@/lib/activity-log";
import { getResource, type Row } from "@/lib/resources";
import { formatDate, formatNumber } from "@/lib/utils";

// The platform administrator works above any one school: every organization,
// every campus, the people who run them, and the health of the system. This
// follows the reference's platform-scoped tools (organizations, campus health,
// administrators, invitations, roles and the server log).

const rowsOf = (slug: string): Row[] => getResource(slug)?.rows ?? [];
const num = (value: Row[string]) => Number(value ?? 0);

function SeeAll({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} className="inline-flex min-h-10 select-none items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      {children} <ArrowUpRight className="size-4" />
    </Link>
  );
}

export function PlatformAdminDashboard() {
  const organizations = rowsOf("organizations");
  const campuses = rowsOf("schools");
  const admins = rowsOf("admins");
  const invitations = rowsOf("account-invitations");
  const roles = rowsOf("roles");

  const totalStudents = campuses.reduce((sum, campus) => sum + num(campus.students), 0);
  const totalTeachers = campuses.reduce((sum, campus) => sum + num(campus.teachers), 0);
  const largestCampus = Math.max(1, ...campuses.map((campus) => num(campus.students)));
  const needsSetup = campuses.filter((campus) => campus.status !== "Active");
  const pendingInvitations = invitations.filter((invitation) => invitation.status === "Pending");
  const recentActivity = ACTIVITY_LOG.slice(0, 6);
  const problems = ACTIVITY_LOG.filter((entry) => entry.level !== "Info").length;

  // Campus counts and enrolment come from the campuses themselves so every
  // total on this page agrees.
  const organizationSummaries = organizations.map((organization) => {
    const own = campuses.filter((campus) => campus.organization === organization.name);
    return {
      id: organization.id,
      name: String(organization.name),
      code: String(organization.code),
      campusCount: own.length,
      students: own.reduce((sum, campus) => sum + num(campus.students), 0),
    };
  });

  const snapshot = [
    { label: "Organizations", value: organizations.length, href: "/organizations" },
    { label: "Campuses", value: campuses.length, href: "/schools" },
    { label: "Active students", value: totalStudents, href: "/schools" },
    { label: "Teachers", value: totalTeachers, href: "/schools" },
    { label: "Administrators", value: admins.length, href: "/admins" },
    { label: "Pending invitations", value: pendingInvitations.length, href: "/account-invitations" },
    { label: "Roles", value: roles.length, href: "/roles" },
  ];

  return (
    <div className="space-y-10">
      <section className="flex flex-col gap-4 border-b pb-6 md:flex-row md:items-end md:justify-between" aria-labelledby="platform-heading">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Platform administrator</p>
          <h2 id="platform-heading" className="mt-1 text-xl font-semibold tracking-tight">
            Every organization and campus at a glance
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Totals across the whole platform. Open a campus to work inside it.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ButtonLink href="/organizations/create" variant="outline">
            <Building2 /> Add organization
          </ButtonLink>
          <ButtonLink href="/schools/create" variant="outline">
            <School /> Add campus
          </ButtonLink>
          <ButtonLink href="/account-invitations/create">
            <MailPlus /> Invite someone
          </ButtonLink>
        </div>
      </section>

      {needsSetup.length > 0 && (
        <Alert tone="warning" icon={TriangleAlert} title={`${needsSetup.length} ${needsSetup.length === 1 ? "campus needs" : "campuses need"} setting up`}>
          {needsSetup.map((campus, index) => (
            <span key={campus.id}>
              {index > 0 && ", "}
              <Link href={`/schools/${campus.id}`} className="font-medium text-foreground underline-offset-4 hover:underline">
                {campus.name}
              </Link>
            </span>
          ))}{" "}
          cannot start daily work until its school year and terms are set.
        </Alert>
      )}

      <section aria-label="Platform snapshot">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4 xl:grid-cols-7">
          {snapshot.map((stat) => (
            <Link key={stat.label} href={stat.href} className="group flex min-h-11 select-none flex-col-reverse justify-end">
              <dt className="truncate text-sm text-muted-foreground group-hover:text-foreground">{stat.label}</dt>
              <dd className="text-2xl font-semibold tabular-nums">{formatNumber(stat.value)}</dd>
            </Link>
          ))}
        </dl>
      </section>

      <section className="min-w-0" aria-labelledby="campus-health">
        <SectionHeading title="Campus health" id="campus-health">
          <SeeAll href="/schools">All campuses</SeeAll>
        </SectionHeading>
        {/* `relative` keeps the table's screen-reader-only text inside the scroll box. */}
        <div className="beautify-scrollbar relative max-w-full overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <caption className="sr-only">Students, teachers and readiness of each campus</caption>
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th scope="col" className="py-3 pr-4 font-medium">Campus</th>
                <th scope="col" className="w-[30%] px-4 py-3 font-medium">Students</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Teachers</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Students per teacher</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="py-3 pl-4"><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody>
              {campuses.map((campus) => {
                const students = num(campus.students);
                const teachers = num(campus.teachers);
                const ready = campus.status === "Active";
                return (
                  <tr key={campus.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="py-3 pr-4">
                      <span className="block font-medium">{campus.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {campus.organization} · {campus.city}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="grid grid-cols-[minmax(0,1fr)_3.5rem] items-center gap-3">
                        <span className="relative h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                          <span
                            className="absolute inset-y-0 left-0 rounded-full"
                            style={{ width: `${(students / largestCampus) * 100}%`, backgroundColor: "hsl(var(--chart-2))" }}
                          />
                        </span>
                        <span className="text-right tabular-nums">{formatNumber(students)}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatNumber(teachers)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{teachers ? Math.round(students / teachers) : "—"}</td>
                    <td className="px-4 py-3">
                      <Badge tone={ready ? "success" : "warning"}>{ready ? "Ready" : "Setup needed"}</Badge>
                    </td>
                    <td className="py-3 pl-4 text-right">
                      <Link href={`/schools/${campus.id}`} className="inline-flex min-h-10 items-center gap-1 whitespace-nowrap font-medium underline-offset-4 hover:underline">
                        Open campus <span aria-hidden>→</span>
                        <span className="sr-only">{campus.name}</span>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-10 lg:grid-cols-2">
        <section className="min-w-0" aria-labelledby="organizations-overview">
          <SectionHeading title="Organizations" id="organizations-overview">
            <SeeAll href="/organizations">All organizations</SeeAll>
          </SectionHeading>
          <ul className="divide-y">
            {organizationSummaries.map((organization) => (
              <li key={organization.id}>
                <Link href={`/organizations/${organization.id}`} className="flex min-h-14 items-center justify-between gap-4 py-2 hover:bg-muted/40">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{organization.name}</span>
                    <span className="block font-mono text-xs text-muted-foreground">{organization.code}</span>
                  </span>
                  <span className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    <span className="block">
                      {organization.campusCount} {organization.campusCount === 1 ? "campus" : "campuses"}
                    </span>
                    <span className="block">{formatNumber(organization.students)} students</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="min-w-0" aria-labelledby="invitations-overview">
          <SectionHeading title="Waiting on an invitation" id="invitations-overview">
            <SeeAll href="/account-invitations">All invitations</SeeAll>
          </SectionHeading>
          {pendingInvitations.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">Nobody is waiting to set up an account.</p>
          ) : (
            <ul className="divide-y">
              {pendingInvitations.slice(0, 5).map((invitation) => (
                <li key={invitation.id}>
                  <Link href={`/account-invitations/${invitation.id}`} className="flex min-h-14 items-center justify-between gap-4 py-2 hover:bg-muted/40">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{invitation.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {invitation.role} · {invitation.email}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">Expires {formatDate(String(invitation.expires))}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section className="min-w-0" aria-labelledby="activity-overview">
          <SectionHeading title="Recent activity" id="activity-overview">
            <SeeAll href="/activity-logs">{problems > 0 ? `Activity logs · ${problems} to review` : "Activity logs"}</SeeAll>
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

        <section className="min-w-0" aria-labelledby="admins-overview">
          <SectionHeading title="Administrators" id="admins-overview">
            <SeeAll href="/admins">Manage</SeeAll>
          </SectionHeading>
          <ul className="divide-y">
            {admins.map((admin) => (
              <li key={admin.id}>
                <Link href={`/admins/${admin.id}`} className="flex min-h-14 items-center gap-3 py-2 hover:bg-muted/40">
                  <Avatar name={String(admin.name)} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{admin.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{admin.role}</span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">Seen {formatDate(String(admin.lastSeen))}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="min-w-0 space-y-4" aria-labelledby="system-health">
        <SectionHeading title="System health" id="system-health" />
        <BackendStatus />
      </section>
    </div>
  );
}
