import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { Page } from "@/components/layout/page-header";
import { ResourceDetail } from "@/components/resource/resource-detail";
import { PrintButton } from "@/components/screens/print-button";
import { ButtonLink } from "@/components/ui/button";
import { getResource, getRow, resources, rowTitle } from "@/lib/resources";

type Props = { params: Promise<{ resource: string; id: string }> };

// Prerender the first records of each screen; the rest render on first visit.
export function generateStaticParams() {
  return resources.flatMap((resource) => resource.rows.slice(0, 3).map((row) => ({ resource: resource.slug, id: row.id })));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { resource: slug, id } = await params;
  const resource = getResource(slug);
  const row = resource && getRow(resource, id);
  return { title: resource && row ? rowTitle(resource, row) : "Not found" };
}

export default async function ResourceShowPage({ params }: Props) {
  const { resource: slug, id } = await params;
  const resource = getResource(slug);
  const row = resource && getRow(resource, id);
  if (!resource || !row) notFound();
  const title = rowTitle(resource, row);
  const printable = resource.view === "invoice" || resource.view === "report-card";

  return (
    <Page
      title={title}
      breadcrumbs={[{ label: resource.title, href: `/${resource.slug}` }, { label: title }]}
      actions={
        <>
          {printable && <PrintButton />}
          {resource.form && (
            <ButtonLink href={`/${resource.slug}/${row.id}/edit`} variant="outline">
              <Pencil /> Edit
            </ButtonLink>
          )}
        </>
      }
    >
      <ResourceDetail resource={resource} row={row} />
    </Page>
  );
}
