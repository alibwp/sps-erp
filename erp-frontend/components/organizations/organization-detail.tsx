"use client";

import { Pencil } from "lucide-react";
import { Page } from "@/components/layout/page-header";
import { BillingGroupsPanel } from "@/components/organizations/billing-groups-panel";
import { CampusesPanel } from "@/components/organizations/campuses-panel";
import { MembersPanel } from "@/components/organizations/members-panel";
import { AccessBadge } from "@/components/organizations/organization-list";
import { TemplatesPanel } from "@/components/organizations/templates-panel";
import { Loaded } from "@/components/ui/api-states";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { DELEGABLE_PERMISSIONS, orgApi, orgCan, OrgPermission, type OrganizationDto } from "@/lib/organizations";
import { useApiQuery } from "@/lib/use-api";
import { formatDate } from "@/lib/utils";

/**
 * One organization: its details and, in tabs, its campuses, billing groups,
 * members and calendar templates. Tabs the person may not use are left out.
 */
export function OrganizationDetail({ id }: { id: string }) {
  const organization = useApiQuery<OrganizationDto>(orgApi.one(id), { keepPrevious: true });
  const name = organization.data?.name ?? "Organization";

  return (
    <Page
      title={name}
      breadcrumbs={[{ label: "Organizations", href: "/organizations" }, { label: name }]}
      actions={
        organization.data && orgCan(organization.data, OrgPermission.Manage) ? (
          <ButtonLink href={`/organizations/${id}/edit`} variant="outline">
            <Pencil /> Edit
          </ButtonLink>
        ) : undefined
      }
    >
      <Loaded query={organization}>{(data) => <OrganizationTabs organization={data} />}</Loaded>
    </Page>
  );
}

function OrganizationTabs({ organization }: { organization: OrganizationDto }) {
  const tabs = [
    { label: "Overview", content: <Overview organization={organization} /> },
    { label: "Campuses", content: <CampusesPanel organization={organization} /> },
    orgCan(organization, OrgPermission.Manage) && {
      label: "Billing groups",
      content: <BillingGroupsPanel organization={organization} />,
    },
    orgCan(organization, OrgPermission.ManageMembers) && {
      label: "Members",
      content: <MembersPanel organization={organization} />,
    },
    { label: "Calendar templates", content: <TemplatesPanel organization={organization} /> },
  ].filter((tab) => tab !== false);

  return <Tabs tabs={tabs} />;
}

function Overview({ organization }: { organization: OrganizationDto }) {
  const details: Array<[string, string | null]> = [
    ["Code", organization.code],
    ["Email", organization.email],
    ["Phone", organization.phone],
    ["Head office", organization.address],
    ["Created", formatDate(organization.createdAt)],
  ];
  const yours = DELEGABLE_PERMISSIONS.filter(({ value }) => orgCan(organization, value));

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        {details.map(([label, value]) => (
          <div key={label} className="grid gap-1">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className={label === "Code" ? "font-mono text-sm" : "whitespace-pre-line text-sm"}>{value || "—"}</dd>
          </div>
        ))}
      </dl>
      <section className="grid content-start gap-3" aria-labelledby="your-access">
        <div className="flex items-center justify-between gap-2">
          <h2 id="your-access" className="font-medium">
            Your access
          </h2>
          <AccessBadge organization={organization} />
        </div>
        {yours.length === 0 ? (
          <p className="text-sm text-muted-foreground">You can read this organization but not change it.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {yours.map(({ value, label }) => (
              <li key={value}>
                <Badge>{label}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
