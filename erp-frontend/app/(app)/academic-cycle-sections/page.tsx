import type { Metadata } from "next";
import { SectionsScreen } from "@/components/academic/sections";
import { Page } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Sections" };

export default function SectionsPage() {
  return (
    <Page title="Sections" breadcrumbs={[{ label: "Sections" }]}>
      <SectionsScreen />
    </Page>
  );
}
