import type { Metadata } from "next";
import { Suspense } from "react";
import { Page } from "@/components/layout/page-header";
import { SchoolsScreen } from "@/components/organizations/organization-screens";

export const metadata: Metadata = { title: "Schools" };

export default function SchoolsPage() {
  return (
    <Page title="Schools" breadcrumbs={[{ label: "Schools" }]}>
      {/* The organization is read from the address (?org=). */}
      <Suspense>
        <SchoolsScreen />
      </Suspense>
    </Page>
  );
}
