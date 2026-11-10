import { SectionHeading } from "@/components/ui/misc";
import { FeesCollectedTrend, MoneyInOutTrend, OwedTrend } from "@/components/dashboards/finance-trends";
import { ActiveStudentsSnapshot, EnrolmentByClassTrend } from "@/components/dashboards/trends";

/**
 * The accountant's dashboard, as the reference shows it: the one school
 * figure an accountant may read (active students), then the money trends and
 * enrolment by class. No setup card, attendance, calendar or notices, since
 * the accountant holds none of those permissions.
 */
export function AccountantDashboard() {
  return (
    <div className="space-y-10">
      <ActiveStudentsSnapshot />

      <section className="space-y-6" aria-labelledby="trends-overview">
        <SectionHeading title="Trends" id="trends-overview" />
        <div className="grid gap-x-10 gap-y-12 lg:grid-cols-2">
          <FeesCollectedTrend />
          <OwedTrend />
          <MoneyInOutTrend />
          <EnrolmentByClassTrend />
        </div>
      </section>
    </div>
  );
}
