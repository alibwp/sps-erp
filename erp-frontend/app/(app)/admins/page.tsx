import type { Metadata } from "next";
import { AccountList, AddPersonButton } from "@/components/people/accounts";
import { Page } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Accounts" };

export default function AccountsPage() {
  return (
    <Page title="Accounts" breadcrumbs={[{ label: "Accounts" }]} actions={<AddPersonButton />}>
      <AccountList />
    </Page>
  );
}
