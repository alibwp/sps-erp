import type { Metadata } from "next";
import { Page } from "@/components/layout/page-header";
import { PortalAreaView } from "@/components/portal/portal-views";
import { DemoDataNotice } from "@/components/ui/demo";

export const metadata: Metadata = { title: "My school" };

/** The family portal home: the campus, the enrollment and every open area. */
export default function PortalOverviewPage() {
  return (
    <Page title="My school" breadcrumbs={[{ label: "My school" }]}>
      <DemoDataNotice what="The family portal" />
      <PortalAreaView area="overview" />
    </Page>
  );
}
