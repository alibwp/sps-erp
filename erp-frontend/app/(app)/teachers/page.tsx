import type { Metadata } from "next";
import { AddPersonButton } from "@/components/people/accounts";
import { RoleMembers } from "@/components/people/role-lists";
import { Page } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Teachers" };

export default function TeachersPage() {
  return (
    <Page
      title="Teachers"
      breadcrumbs={[{ label: "Teachers" }]}
      actions={<AddPersonButton href="/teachers/create" label="Add teacher" />}
    >
      <RoleMembers role="teacher" />
    </Page>
  );
}
