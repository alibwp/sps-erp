"use client";

import Link from "next/link";
import { ArrowUpRight, Download } from "lucide-react";
import { usePortalLearner } from "@/components/portal/portal-views";
import { ReportDownload } from "@/components/screens/report-download";
import { SectionHeading } from "@/components/ui/misc";
import { formatDate } from "@/lib/utils";

/**
 * The dashboard of a portal-only person (student or parent), as the
 * reference shows it. School figures, attendance, calendar and trends are
 * left out; what remains is the notices sent to them. Everything else is
 * under "My school".
 *
 * `showProfile` adds the "Download profile" bar, which the reference shows
 * to students only.
 */
export function PortalDashboard({ showProfile }: { showProfile: boolean }) {
  const learner = usePortalLearner();
  const notices = learner?.notices.slice(0, 5) ?? [];

  return (
    <div className="space-y-10">
      <section className="min-w-0" aria-labelledby="notices-overview">
        <SectionHeading title="Notices" id="notices-overview">
          <Link href="/portal/notices" className="inline-flex min-h-10 select-none items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            All notices <ArrowUpRight className="size-4" />
          </Link>
        </SectionHeading>
        {notices.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No current notices.</p>
        ) : (
          <ul className="divide-y">
            {notices.map((notice) => (
              <li key={notice.id}>
                <Link href="/portal/notices" className="flex min-h-11 items-center justify-between gap-4 py-2 hover:bg-muted/40">
                  <span className="min-w-0 break-words text-sm font-medium">{notice.title}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">Until {formatDate(notice.until).replace(/ \d{4}$/, "")}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {showProfile && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-y py-3">
          <p className="font-medium">Your profile</p>
          <ReportDownload title="Your profile">
            <Download /> Download profile
          </ReportDownload>
        </div>
      )}
    </div>
  );
}

export function StudentDashboard() {
  return <PortalDashboard showProfile />;
}

export function ParentDashboard() {
  return <PortalDashboard showProfile={false} />;
}
