"use client";

import { useSearchParams } from "next/navigation";
import { CampusesPanel } from "@/components/organizations/campuses-panel";
import { OrganizationPicker, useOrganizationChoice, WithOrganization } from "@/components/organizations/organization-picker";
import { TemplatesPanel } from "@/components/organizations/templates-panel";

// The top-level /schools and /calendar-templates pages: the same panels as the
// organization's tabs, for the organization picked at the top (?org=).

/** /schools: campuses of the chosen organization. ?new=1 opens "Open campus". */
export function SchoolsScreen() {
  const choice = useOrganizationChoice();
  const startCreating = useSearchParams().get("new") === "1";
  return (
    <div className="grid gap-6">
      <OrganizationPicker choice={choice} />
      <WithOrganization choice={choice}>
        {(organization) => <CampusesPanel key={organization.id} organization={organization} startCreating={startCreating} />}
      </WithOrganization>
    </div>
  );
}

/** /calendar-templates: templates of the chosen organization. */
export function TemplatesScreen() {
  const choice = useOrganizationChoice();
  return (
    <div className="grid gap-6">
      <OrganizationPicker choice={choice} />
      <WithOrganization choice={choice}>
        {(organization) => <TemplatesPanel key={organization.id} organization={organization} />}
      </WithOrganization>
    </div>
  );
}
