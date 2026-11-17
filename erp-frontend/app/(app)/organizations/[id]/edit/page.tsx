import type { Metadata } from "next";
import { EditOrganization } from "@/components/organizations/organization-form";

export const metadata: Metadata = { title: "Edit organization" };

type Props = { params: Promise<{ id: string }> };

export default async function EditOrganizationPage({ params }: Props) {
  const { id } = await params;
  return <EditOrganization id={id} />;
}
