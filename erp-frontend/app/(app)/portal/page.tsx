import type { Metadata } from "next";
import { Page } from "@/components/layout/page-header";
import { PortalAreaView } from "@/components/portal/portal-views";

export const metadata: Metadata = { title: "My school" };

/** The family portal home: the campus, the enrollment and every open area. */
export default function PortalOverviewPage() {
  return (
    <Page title="My school" breadcrumbs={[{ label: "My school" }]}>
      <PortalAreaView area="overview" />
    </Page>
  );
}
