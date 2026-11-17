import type { Metadata } from "next";
import { EditStudent } from "@/components/students/students";

export const metadata: Metadata = { title: "Edit student" };

type Props = { params: Promise<{ id: string }> };

export default async function EditStudentPage({ params }: Props) {
  const { id } = await params;
  return <EditStudent id={id} />;
}
