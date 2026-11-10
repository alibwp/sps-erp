import { Cell } from "@/components/resource/cell";
import { ResourceTable } from "@/components/resource/data-table";
import { InvoiceView } from "@/components/screens/invoice-view";
import { MarkSheet } from "@/components/screens/mark-sheet";
import { PermissionsMatrix } from "@/components/screens/permissions-matrix";
import { ReportCardView } from "@/components/screens/report-card-view";
import { TimetableView } from "@/components/screens/timetable-view";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, SectionHeading } from "@/components/ui/misc";
import { getResource, rowTitle, type Resource, type Row } from "@/lib/resources";
import { formatDate } from "@/lib/utils";
import { DEMO_TODAY, shiftDate } from "@/lib/mock";

export function ResourceDetail({ resource, row }: { resource: Resource; row: Row }) {
  const title = rowTitle(resource, row);

  // Views that replace the generic layout entirely.
  if (resource.view === "invoice") return <InvoiceView row={row} />;
  if (resource.view === "report-card") return <ReportCardView row={row} />;

  const status = resource.columns.find((column) => column.kind === "badge");
  const person = resource.columns[0]?.kind === "person" || resource.view === "person";
  const subtitleColumn = resource.columns.find((column) => column.key === resource.columns[0]?.sub);
  const details = resource.columns.filter((column) => column.key !== resource.titleKey);

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-wrap items-center gap-4" aria-label="Summary">
        {person && <Avatar name={title} size="xl" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
            {status && row[status.key] !== null && <StatusBadge value={String(row[status.key])} />}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {subtitleColumn ? String(row[subtitleColumn.key] ?? "") : resource.singular}
            {" · "}
            <span className="font-mono text-xs">#{row.id.padStart(4, "0")}</span>
          </p>
        </div>
      </section>

      {resource.view === "timetable" && <TimetableView seed={Number(row.id)} />}
      {resource.view === "marksheet" && <MarkSheet seed={Number(row.id)} />}
      {resource.view === "permissions" && <PermissionsMatrix role={title} />}

      <div className="grid gap-10 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
              {details.map((column) => (
                <div key={column.key} className="min-w-0">
                  <dt className="text-sm text-muted-foreground">{column.label}</dt>
                  <dd className="mt-1 text-sm font-medium">
                    <Cell column={{ ...column, sub: undefined }} row={row} />
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <section aria-labelledby="history-heading" className="min-w-0">
          <SectionHeading title="History" id="history-heading" />
          <ol className="relative mt-4 grid gap-5 border-l pl-5">
            {history(resource, Number(row.id)).map((entry) => (
              <li key={entry.what} className="relative">
                <span className="absolute -left-[1.6rem] top-1 size-2.5 rounded-full border-2 border-background bg-foreground/50" aria-hidden />
                <p className="text-sm font-medium">{entry.what}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(entry.when)} · {entry.who}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {resource.related?.map((relation) => {
        const related = getResource(relation.slug);
        if (!related) return null;
        return (
          <section key={relation.slug} aria-label={relation.title ?? related.title} className="grid gap-4">
            <SectionHeading title={relation.title ?? related.title} />
            <ResourceTable slug={relation.slug} filter={{ key: relation.matchKey, value: title }} compact />
          </section>
        );
      })}
    </div>
  );
}

function history(resource: Resource, seed: number) {
  const singular = resource.singular.toLowerCase();
  return [
    { what: `${resource.singular} updated`, when: shiftDate(DEMO_TODAY, -(seed % 9) - 1), who: "Adil Mehmood" },
    { what: `Details reviewed`, when: shiftDate(DEMO_TODAY, -(seed % 23) - 12), who: "Sadia Raza" },
    { what: `${resource.singular} created`, when: shiftDate(DEMO_TODAY, -(seed % 60) - 40), who: `Azeem Abbasi added this ${singular}` },
  ];
}
