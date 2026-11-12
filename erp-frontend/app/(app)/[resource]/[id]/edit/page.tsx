import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Page } from "@/components/layout/page-header";
import { ResourceForm } from "@/components/resource/resource-form";
import { getResource, getRow, resources, rowTitle } from "@/lib/resources";

type Props = { params: Promise<{ resource: string; id: string }> };

export function generateStaticParams() {
  return resources
    .filter((resource) => resource.form)
    .flatMap((resource) => resource.rows.slice(0, 2).map((row) => ({ resource: resource.slug, id: row.id })));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { resource: slug, id } = await params;
  const resource = getResource(slug);
  const row = resource && getRow(resource, id);
  return { title: resource && row ? `Edit ${rowTitle(resource, row)}` : "Not found" };
}

export default async function ResourceEditPage({ params }: Props) {
  const { resource: slug, id } = await params;
  const resource = getResource(slug);
  const row = resource && getRow(resource, id);
  if (!resource?.form || !row) notFound();
  const title = rowTitle(resource, row);

  return (
    <Page
      title={`Edit ${title}`}
      breadcrumbs={[
        { label: resource.title, href: `/${resource.slug}` },
        { label: title, href: `/${resource.slug}/${row.id}` },
        { label: "Edit" },
      ]}
    >
      <ResourceForm slug={resource.slug} id={row.id} />
    </Page>
  );
}
