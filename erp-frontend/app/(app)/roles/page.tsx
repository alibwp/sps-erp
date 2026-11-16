import type { Metadata } from "next";
import { NewRoleButton, RoleList } from "@/components/people/roles";
import { Page } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Roles" };

export default function RolesPage() {
  return (
    <Page title="Roles" breadcrumbs={[{ label: "Roles" }]} actions={<NewRoleButton />}>
      <RoleList />
    </Page>
  );
}
