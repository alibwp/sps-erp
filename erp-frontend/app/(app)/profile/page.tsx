import type { Metadata } from "next";
import { Page } from "@/components/layout/page-header";
import { ProfileForms } from "@/components/screens/profile-forms";

export const metadata: Metadata = { title: "Profile" };

export default function ProfilePage() {
  return (
    <Page title="Profile" breadcrumbs={[{ label: "Profile" }]}>
      <ProfileForms />
    </Page>
  );
}
