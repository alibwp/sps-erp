import type { Metadata } from "next";
import { BackendStatus } from "@/components/backend-status";
import { Page } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { SectionHeading } from "@/components/ui/misc";
import { DEMO_TODAY, createRandom, shiftDate } from "@/lib/mock";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Activity logs" };

const random = createRandom(909);

const ACTIONS: { level: "Info" | "Warning" | "Error"; message: string }[] = [
  { level: "Info", message: "Azeem Abbasi signed in" },
  { level: "Info", message: "Adil Mehmood updated student Ayesha Khan" },
  { level: "Info", message: "Kamran Butt recorded a payment of Rs 21,000 on INV-2026-1204" },
  { level: "Warning", message: "Five failed sign-in attempts for teacher@spsarmyschool.edu.pk" },
  { level: "Info", message: "Sadia Raza published the notice “Winter uniform from 15 November”" },
  { level: "Error", message: "Email delivery failed for 2 invitation messages" },
  { level: "Info", message: "Timetable Class 6 A published" },
  { level: "Info", message: "Import students-class-6.csv completed: 112 rows" },
  { level: "Warning", message: "Budget “Utilities” passed 85% of its plan" },
  { level: "Info", message: "Marks submitted for Mathematics · Class 9 A" },
  { level: "Info", message: "Nightly backup completed" },
  { level: "Error", message: "Report card PDF failed to render for Class 10 B" },
];

const LOGS = ACTIONS.map((action, index) => ({
  ...action,
  date: shiftDate(DEMO_TODAY, -Math.floor(index / 3)),
  time: `${String(random.int(7, 17)).padStart(2, "0")}:${String(random.int(0, 59)).padStart(2, "0")}`,
  ip: `182.185.${random.int(1, 254)}.${random.int(1, 254)}`,
}));

const TONES = { Info: "neutral", Warning: "warning", Error: "danger" } as const;

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
                {LOGS.map((log, index) => (
                  <tr key={index} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <Badge tone={TONES[log.level]}>{log.level}</Badge>
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
