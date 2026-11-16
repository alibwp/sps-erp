import type { Metadata } from "next";
import { Page } from "@/components/layout/page-header";
import { NewOrganizationButton, OrganizationList } from "@/components/organizations/organization-list";

export const metadata: Metadata = { title: "Organizations" };

export default function OrganizationsPage() {
  return (
    <Page title="Organizations" breadcrumbs={[{ label: "Organizations" }]} actions={<NewOrganizationButton />}>
      <OrganizationList />
    </Page>
  );
}
