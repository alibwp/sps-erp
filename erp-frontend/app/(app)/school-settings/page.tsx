import type { Metadata } from "next";
import { Page } from "@/components/layout/page-header";
import { SchoolSettings } from "@/components/screens/school-settings";

export const metadata: Metadata = { title: "School settings" };

export default function SchoolSettingsPage() {
  return (
    <Page title="School settings" breadcrumbs={[{ label: "School settings" }]}>
      <SchoolSettings />
    </Page>
  );
}
