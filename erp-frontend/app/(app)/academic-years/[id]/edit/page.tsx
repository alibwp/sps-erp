import type { Metadata } from "next";
import { EditYear } from "@/components/academic/years";

export const metadata: Metadata = { title: "Edit school year" };

type Props = { params: Promise<{ id: string }> };

export default async function EditAcademicYearPage({ params }: Props) {
  const { id } = await params;
  return <EditYear id={id} />;
}
