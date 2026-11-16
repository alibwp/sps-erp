import type { Metadata } from "next";
import { BackendStatus } from "@/components/backend-status";
import { Page } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { SectionHeading } from "@/components/ui/misc";
import { ACTIVITY_LOG, LOG_TONES } from "@/lib/activity-log";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Activity logs" };

export default function ActivityLogsPage() {
  return (
    <Page title="Activity logs" breadcrumbs={[{ label: "Activity logs" }]}>
      <div className="grid gap-10">
        <BackendStatus />
        <section aria-labelledby="logs-heading" className="grid gap-4">
          <SectionHeading title="Recent activity" id="logs-heading" />
          <div className="beautify-scrollbar overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="bg-muted/50">
                <tr className="border-b text-left text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-medium">Level</th>
                  <th scope="col" className="px-4 py-3 font-medium">When</th>
                  <th scope="col" className="px-4 py-3 font-medium">Message</th>
                  <th scope="col" className="px-4 py-3 font-medium">IP address</th>
                </tr>
              </thead>
              <tbody>
                {ACTIVITY_LOG.map((log, index) => (
                  <tr key={index} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <Badge tone={LOG_TONES[log.level]}>{log.level}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted-foreground">
                      {formatDate(log.date)} · {log.time}
                    </td>
                    <td className="px-4 py-3">{log.message}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{log.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </Page>
  );
}
