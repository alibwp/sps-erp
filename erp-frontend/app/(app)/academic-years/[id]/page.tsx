import type { Metadata } from "next";
import { YearDetailScreen } from "@/components/academic/year-detail";

export const metadata: Metadata = { title: "School year" };

type Props = { params: Promise<{ id: string }> };

export default async function AcademicYearPage({ params }: Props) {
  const { id } = await params;
  return <YearDetailScreen id={id} />;
}
