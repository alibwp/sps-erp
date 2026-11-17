import type { Metadata } from "next";
import { CreateOrganization } from "@/components/organizations/organization-form";

export const metadata: Metadata = { title: "New organization" };

export default function CreateOrganizationPage() {
  return <CreateOrganization />;
}
