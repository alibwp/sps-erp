import type { Metadata } from "next";
import { StudentDetail } from "@/components/students/student-detail";

export const metadata: Metadata = { title: "Student" };

type Props = { params: Promise<{ id: string }> };

export default async function StudentPage({ params }: Props) {
  const { id } = await params;
  return <StudentDetail id={id} />;
}
