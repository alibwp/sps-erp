import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { Page } from "@/components/layout/page-header";
import { IfCanChange } from "@/components/layout/role-guard";
import { ResourceTable } from "@/components/resource/data-table";
import { CalendarMonth } from "@/components/screens/calendar-month";
import { ButtonLink } from "@/components/ui/button";
import { getResource, resources } from "@/lib/resources";

type Props = { params: Promise<{ resource: string }> };

export function generateStaticParams() {
  return resources.map((resource) => ({ resource: resource.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { resource: slug } = await params;
  return { title: getResource(slug)?.title ?? "Not found" };
}

export default async function ResourceListPage({ params }: Props) {
  const { resource: slug } = await params;
  const resource = getResource(slug);
  if (!resource) notFound();

  return (
    <Page
      title={resource.title}
      breadcrumbs={[{ label: resource.title }]}
      actions={
        resource.form && (
          <IfCanChange href={`/${resource.slug}`}>
            <ButtonLink href={`/${resource.slug}/create`}>
              <Plus /> {resource.createLabel ?? `Add ${resource.singular.toLowerCase()}`}
            </ButtonLink>
          </IfCanChange>
        )
      }
    >
      <div className="grid gap-10">
        {resource.slug === "calendar-events" && <CalendarMonth />}
        <ResourceTable slug={resource.slug} />
      </div>
    </Page>
  );
}
