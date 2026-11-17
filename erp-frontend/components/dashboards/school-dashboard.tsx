import { SectionHeading } from "@/components/ui/misc";
import { FeesCollectedTrend, MoneyInOutTrend, OwedTrend } from "@/components/dashboards/finance-trends";
import { EnrolmentByClassTrend, SchoolSnapshot, SetupBanner } from "@/components/dashboards/live";
import {
  AttendanceToday,
  AttendanceTrend,
  IncidentsTrend,
  NextSevenDays,
  NoticesSection,
} from "@/components/dashboards/school-sections";

/**
 * The whole-school dashboard, as the reference shows it to a school
 * administrator. Roles without their own dashboard see it too.
 *
 * The setup progress, the snapshot and enrolment by class come from the
 * backend; attendance, the calendar, notices, finance and incidents have no
 * backend yet and are marked as sample data.
 *
 * `linkCampuses` is false for someone without organization access: the
 * reference still shows how many campuses there are, but not as a link.
 */
export function SchoolDashboard({ linkCampuses = true }: { linkCampuses?: boolean }) {
  return (
    <div className="space-y-10">
      <SetupBanner />
      <SchoolSnapshot linkCampuses={linkCampuses} />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <AttendanceToday />
        <NextSevenDays />
      </div>

      <section className="space-y-6" aria-labelledby="trends-overview">
        <SectionHeading title="Trends" id="trends-overview" />
        <div className="grid gap-x-10 gap-y-12 lg:grid-cols-2">
          <EnrolmentByClassTrend />
          <AttendanceTrend />
          <FeesCollectedTrend />
          <OwedTrend />
          <MoneyInOutTrend />
          <IncidentsTrend />
        </div>
      </section>

      <NoticesSection />
    </div>
  );
}
