import type { Metadata } from "next";
import { AdmitButton, StudentList } from "@/components/students/students";
import { Page } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Students" };

export default function StudentsPage() {
  return (
    <Page title="Students" breadcrumbs={[{ label: "Students" }]} actions={<AdmitButton />}>
      <StudentList />
    </Page>
  );
}
