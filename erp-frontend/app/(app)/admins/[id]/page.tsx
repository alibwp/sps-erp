import type { Metadata } from "next";
import { AccountDetailScreen } from "@/components/people/accounts";

export const metadata: Metadata = { title: "Account" };

type Props = { params: Promise<{ id: string }> };

export default async function AccountPage({ params }: Props) {
  const { id } = await params;
  return <AccountDetailScreen id={id} />;
}
