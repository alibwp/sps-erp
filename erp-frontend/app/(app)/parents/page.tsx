import type { Metadata } from "next";
import { RoleMembers } from "@/components/people/role-lists";
import { Page } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Parents" };

// No "Add parent": the parent role is not given from a campus's accounts.
export default function ParentsPage() {
  return (
    <Page title="Parents" breadcrumbs={[{ label: "Parents" }]}>
      <RoleMembers role="parent" />
    </Page>
  );
}
