import type { Metadata } from "next";
import { RoleDetailScreen } from "@/components/people/roles";

export const metadata: Metadata = { title: "Role" };

type Props = { params: Promise<{ id: string }> };

export default async function RolePage({ params }: Props) {
  const { id } = await params;
  return <RoleDetailScreen id={id} />;
}
