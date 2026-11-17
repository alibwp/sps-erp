import type { Metadata } from "next";
import { EditRole } from "@/components/people/roles";

export const metadata: Metadata = { title: "Edit role" };

type Props = { params: Promise<{ id: string }> };

export default async function EditRolePage({ params }: Props) {
  const { id } = await params;
  return <EditRole id={id} />;
}
