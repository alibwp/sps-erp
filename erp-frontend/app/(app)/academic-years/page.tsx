import type { Metadata } from "next";
import { NewYearButton, YearList } from "@/components/academic/years";
import { Page } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "School years" };

export default function AcademicYearsPage() {
  return (
    <Page title="School years" breadcrumbs={[{ label: "School years" }]} actions={<NewYearButton />}>
      <YearList />
    </Page>
  );
}
