import type { Metadata } from "next";
import { Page } from "@/components/layout/page-header";
import { PortalAreaView } from "@/components/portal/portal-views";
import { PORTAL_HOME } from "@/lib/portal";

export const metadata: Metadata = { title: "Notification settings" };

export default function PortalNotificationSettingsPage() {
  return (
    <Page title="Notification settings" breadcrumbs={[{ label: "My school", href: PORTAL_HOME }, { label: "Notification settings" }]}>
      <PortalAreaView area="notification-preferences" />
    </Page>
  );
}
