import type { Metadata } from "next";
import { Suspense } from "react";
import { Page } from "@/components/layout/page-header";
import { TemplatesScreen } from "@/components/organizations/organization-screens";

export const metadata: Metadata = { title: "Calendar templates" };

export default function CalendarTemplatesPage() {
  return (
    <Page title="Calendar templates" breadcrumbs={[{ label: "Calendar templates" }]}>
      {/* The organization is read from the address (?org=). */}
      <Suspense>
        <TemplatesScreen />
      </Suspense>
    </Page>
  );
}
