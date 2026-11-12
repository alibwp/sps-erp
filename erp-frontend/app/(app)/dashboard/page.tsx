import type { Metadata } from "next";
import { Page } from "@/components/layout/page-header";
import { AccountantDashboard } from "@/components/dashboards/accountant-dashboard";
import { LibrarianDashboard } from "@/components/dashboards/librarian-dashboard";
import { PlatformAdminDashboard } from "@/components/dashboards/platform-admin-dashboard";
import { RoleDashboard } from "@/components/dashboards/role-dashboard";
import { SchoolDashboard } from "@/components/dashboards/school-dashboard";
import { ParentDashboard, StudentDashboard } from "@/components/dashboards/student-dashboard";
import { TeacherDashboard } from "@/components/dashboards/teacher-dashboard";

export const metadata: Metadata = { title: "Dashboard" };

// One dashboard per role. Add each role's dashboard here as it is built;
// until then that role sees the whole-school dashboard.
export default function DashboardPage() {
  return (
    <Page title="Dashboard" breadcrumbs={[]}>
      <RoleDashboard
        dashboards={{
          "platform-admin": <PlatformAdminDashboard />,
          "school-admin": <SchoolDashboard linkCampuses={false} />,
          accountant: <AccountantDashboard />,
          librarian: <LibrarianDashboard />,
          teacher: <TeacherDashboard />,
          student: <StudentDashboard />,
          parent: <ParentDashboard />,
        }}
        fallback={<SchoolDashboard />}
      />
    </Page>
  );
}
