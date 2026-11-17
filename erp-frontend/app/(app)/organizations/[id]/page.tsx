import type { Metadata } from "next";
import { OrganizationDetail } from "@/components/organizations/organization-detail";

export const metadata: Metadata = { title: "Organization" };

type Props = { params: Promise<{ id: string }> };

export default async function OrganizationPage({ params }: Props) {
  const { id } = await params;
  return <OrganizationDetail id={id} />;
}
