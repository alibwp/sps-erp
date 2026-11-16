import type { Metadata } from "next";
import { InvitationList } from "@/components/people/invitations";
import { Page } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Account invitations" };

export default function AccountInvitationsPage() {
  return (
    <Page title="Account invitations" breadcrumbs={[{ label: "Account invitations" }]}>
      <InvitationList />
    </Page>
  );
}
