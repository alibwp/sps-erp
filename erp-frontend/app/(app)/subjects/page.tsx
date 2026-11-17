import type { Metadata } from "next";
import { SubjectsScreen } from "@/components/academic/subjects";
import { Page } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Subjects" };

export default function SubjectsPage() {
  return (
    <Page title="Subjects" breadcrumbs={[{ label: "Subjects" }]}>
      <SubjectsScreen />
    </Page>
  );
}
