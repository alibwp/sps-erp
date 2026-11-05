import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Page } from "@/components/layout/page-header";
import { ResourceForm } from "@/components/resource/resource-form";
import { getResource, resources } from "@/lib/resources";

type Props = { params: Promise<{ resource: string }> };

export function generateStaticParams() {
  return resources.filter((resource) => resource.form).map((resource) => ({ resource: resource.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { resource: slug } = await params;
  const resource = getResource(slug);
  return { title: resource ? (resource.createLabel ?? `Add ${resource.singular.toLowerCase()}`) : "Not found" };
}

export default async function ResourceCreatePage({ params }: Props) {
  const { resource: slug } = await params;
  const resource = getResource(slug);
  if (!resource?.form) notFound();
  const title = resource.createLabel ?? `Add ${resource.singular.toLowerCase()}`;

  return (
    <Page title={title} breadcrumbs={[{ label: resource.title, href: `/${resource.slug}` }, { label: title }]}>
      <ResourceForm slug={resource.slug} />
    </Page>
  );
}
