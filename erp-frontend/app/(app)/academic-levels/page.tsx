import type { Metadata } from "next";
import { LevelsScreen } from "@/components/academic/levels";
import { Page } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Classes" };

export default function AcademicLevelsPage() {
  return (
    <Page title="Classes" breadcrumbs={[{ label: "Classes" }]}>
      <LevelsScreen />
    </Page>
  );
}
