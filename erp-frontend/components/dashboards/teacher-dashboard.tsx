import { SectionHeading } from "@/components/ui/misc";
import { AttendanceToday, AttendanceTrend, NextSevenDays, NoticesSection } from "@/components/dashboards/school-sections";
import { ActiveStudentsSnapshot, EnrolmentByClassTrend } from "@/components/dashboards/trends";

/**
 * The teacher's dashboard, as the reference shows it. A teacher reads
 * students, attendance, the calendar and notices, so they see the active
 * students figure, today's attendance beside the next seven days, attendance
 * and enrolment trends, and current notices. No setup card or money figures.
 */
export function TeacherDashboard() {
  return (
    <div className="space-y-10">
      <ActiveStudentsSnapshot />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <AttendanceToday />
        <NextSevenDays />
      </div>

      <section className="space-y-6" aria-labelledby="trends-overview">
        <SectionHeading title="Trends" id="trends-overview" />
        <div className="grid gap-x-10 gap-y-12 lg:grid-cols-2">
          <AttendanceTrend />
          <EnrolmentByClassTrend />
        </div>
      </section>

      <NoticesSection />
    </div>
  );
}
