import { SectionHeading } from "@/components/ui/misc";
import { ActiveStudentsSnapshot, EnrolmentByClassTrend } from "@/components/dashboards/trends";

/**
 * The librarian's dashboard, as the reference shows it. A librarian may read
 * students and run the library, so the dashboard shows only the active
 * students figure and enrolment by class. The library itself is worked from
 * its own pages in the sidebar (Catalogue, Lending desk, Library queue).
 */
export function LibrarianDashboard() {
  return (
    <div className="space-y-10">
      <ActiveStudentsSnapshot />

      <section className="space-y-6" aria-labelledby="trends-overview">
        <SectionHeading title="Trends" id="trends-overview" />
        <div className="grid gap-x-10 gap-y-12 lg:grid-cols-2">
          <EnrolmentByClassTrend />
        </div>
      </section>
    </div>
  );
}
