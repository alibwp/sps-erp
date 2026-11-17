import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Page } from "@/components/layout/page-header";
import { PortalAreaView } from "@/components/portal/portal-views";
import { getPortalArea, PORTAL_AREAS, PORTAL_HOME } from "@/lib/portal";

type Props = { params: Promise<{ area: string }> };

/** The reference titles the documents page differently from its menu entry. */
const HEADINGS: Partial<Record<string, string>> = { documents: "Official documents" };

export function generateStaticParams() {
  return PORTAL_AREAS.map((area) => ({ area: area.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { area } = await params;
  return { title: getPortalArea(area)?.label ?? "Not found" };
}

export default async function PortalAreaPage({ params }: Props) {
  const { area: id } = await params;
  const area = getPortalArea(id);
  if (!area) notFound();

  return (
    <Page title={HEADINGS[area.id] ?? area.label} breadcrumbs={[{ label: "My school", href: PORTAL_HOME }, { label: area.label }]}>
      <PortalAreaView area={area.id} />
    </Page>
  );
}
