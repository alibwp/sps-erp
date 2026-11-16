"use client";

import Link from "next/link";
import { CalendarRange, Plus } from "lucide-react";
import { Loaded } from "@/components/ui/api-states";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { orgApi, orgCan, OrgPermission, type CalendarTemplate, type OrganizationDto } from "@/lib/organizations";
import { useApiQuery } from "@/lib/use-api";
import { formatDate } from "@/lib/utils";

/** Where a template opens: its editor, read-only without "manage organization". */
export function templateHref(organizationId: string, templateId?: string): string {
  return `/calendar-templates/${templateId ?? "create"}?org=${organizationId}`;
}

/** "365 days (52 weeks)". */
export function cycleLength(days: number): string {
  const weeks = Math.round(days / 7);
  return `${days} days${weeks > 0 ? ` (≈ ${weeks} weeks)` : ""}`;
}

/** An organization's calendar templates, the default first. */
export function TemplatesPanel({ organization }: { organization: OrganizationDto }) {
  const canManage = orgCan(organization, OrgPermission.Manage);
  const templates = useApiQuery<CalendarTemplate[]>(orgApi.templates(organization.id), { keepPrevious: true });

  return (
    <div className="grid gap-4">
      {canManage && (
        <div className="flex justify-end">
          <ButtonLink href={templateHref(organization.id)}>
            <Plus /> New template
          </ButtonLink>
        </div>
      )}
      <Loaded query={templates}>
        {(data) =>
          data.length === 0 ? (
            <EmptyState
              icon={CalendarRange}
              title="No calendar templates"
              description="A template holds the terms and holidays of a school year as days from its start. Campuses draft their years from it."
            >
              {canManage && (
                <ButtonLink href={templateHref(organization.id)} variant="outline">
                  <Plus /> New template
                </ButtonLink>
              )}
            </EmptyState>
          ) : (
            <Table busy={templates.loading}>
              <THead>
                <TH>Template</TH>
                <TH>Cycle</TH>
                <TH>Periods</TH>
                <TH>Opens on its own</TH>
                <TH>Created</TH>
              </THead>
              <tbody>
                {[...data]
                  .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name))
                  .map((template) => (
                    <TR key={template.id}>
                      <TD className="max-w-96">
                        <span className="flex flex-wrap items-center gap-2">
                          <Link href={templateHref(organization.id, template.id)} className="font-medium hover:underline hover:underline-offset-4">
                            {template.name}
                          </Link>
                          {template.isDefault && <Badge tone="success">Default</Badge>}
                        </span>
                        {template.description && (
                          <span className="block truncate text-xs text-muted-foreground">{template.description}</span>
                        )}
                      </TD>
                      <TD className="whitespace-nowrap">{cycleLength(template.cycleLengthDays)}</TD>
                      <TD className="tabular-nums">{template.periods.length}</TD>
                      <TD>{template.autoOpen ? "Yes" : "No"}</TD>
                      <TD className="whitespace-nowrap">{formatDate(template.createdAt)}</TD>
                    </TR>
                  ))}
              </tbody>
            </Table>
          )
        }
      </Loaded>
    </div>
  );
}
