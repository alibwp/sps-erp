import type { Metadata } from "next";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { Page } from "@/components/layout/page-header";
import { ReportDownload } from "@/components/screens/report-download";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Reports" };

const REPORTS = [
  { group: "People", title: "Class lists", description: "Every learner by section, with guardians and contacts.", format: "PDF" },
  { group: "People", title: "Enrolment summary", description: "Learners by class, gender and status for the year.", format: "Excel" },
  { group: "People", title: "Staff directory", description: "All staff with designation, department and phone.", format: "Excel" },
  { group: "Attendance", title: "Daily attendance", description: "Present, absent and late learners for a chosen day.", format: "PDF" },
  { group: "Attendance", title: "Chronic absence", description: "Learners below 90% attendance this term.", format: "Excel" },
  { group: "Assessment", title: "Broadsheet", description: "Every learner's marks in every subject for a section.", format: "Excel" },
  { group: "Assessment", title: "Result analysis", description: "Subject averages, pass rates and grade spread.", format: "PDF" },
  { group: "Finance", title: "Fee collection", description: "Billed against collected, by month and section.", format: "Excel" },
  { group: "Finance", title: "Defaulters list", description: "Families with overdue invoices and how late they are.", format: "PDF" },
  { group: "Finance", title: "Budget against actuals", description: "Planned and spent for every account this year.", format: "Excel" },
];

export default function ReportsPage() {
  const groups = [...new Set(REPORTS.map((report) => report.group))];
  return (
    <Page title="Reports" breadcrumbs={[{ label: "Reports" }]}>
      <div className="grid gap-10">
        {groups.map((group) => (
          <section key={group} aria-labelledby={`reports-${group}`} className="grid gap-4">
            <h2 id={`reports-${group}`} className="border-b pb-2 font-semibold">
              {group}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {REPORTS.filter((report) => report.group === group).map((report) => {
                const Icon = report.format === "PDF" ? FileText : FileSpreadsheet;
                return (
                  <Card key={report.title} className="flex flex-col">
                    <CardHeader className="flex-1">
                      <div className="mb-2 inline-flex size-9 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground">
                        <Icon className="size-4" />
                      </div>
                      <CardTitle className="text-base">{report.title}</CardTitle>
                      <CardDescription>{report.description}</CardDescription>
                    </CardHeader>
                    <CardFooter className="justify-between">
                      <span className="text-xs text-muted-foreground">{report.format}</span>
                      <ReportDownload title={report.title}>
                        <Download /> Download
                      </ReportDownload>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </Page>
  );
}
