import type { Metadata } from "next";
import { Page } from "@/components/layout/page-header";
import { AttendanceRegister } from "@/components/screens/attendance-register";
import { DemoDataNotice } from "@/components/ui/demo";

export const metadata: Metadata = { title: "Attendance" };

export default function AttendancePage() {
  return (
    <Page title="Attendance" breadcrumbs={[{ label: "Attendance" }]}>
      <DemoDataNotice />
      <AttendanceRegister />
    </Page>
  );
}
