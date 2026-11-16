import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { Page } from "@/components/layout/page-header";
import { IfCanChange } from "@/components/layout/role-guard";
import { ResourceTable } from "@/components/resource/data-table";
import { CalendarMonth } from "@/components/screens/calendar-month";
import { ButtonLink } from "@/components/ui/button";
import { getResource, resources } from "@/lib/resources";
import { DemoDataNotice } from "@/components/ui/demo";

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
      <DemoDataNotice />
      <div className="grid gap-10">
        {resource.stats && resource.stats.length > 0 && (
          <section aria-label={`${resource.title} summary`}>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 xl:grid-cols-5">
              {resource.stats.map((stat) => (
                <div key={stat.label} className="flex min-w-0 flex-col-reverse justify-end">
                  <dt className="truncate text-sm text-muted-foreground">{stat.label}</dt>
                  <dd className="truncate text-2xl font-semibold tabular-nums">{stat.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
        {resource.slug === "calendar-events" && <CalendarMonth />}
        <ResourceTable slug={resource.slug} />
      </div>
    </Page>
  );
}
