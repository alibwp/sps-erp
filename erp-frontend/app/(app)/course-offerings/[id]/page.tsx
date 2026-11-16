import type { Metadata } from "next";
import { OfferingDetail } from "@/components/teaching/offering-detail";

export const metadata: Metadata = { title: "Subject being taught" };

type Props = { params: Promise<{ id: string }> };

export default async function CourseOfferingPage({ params }: Props) {
  const { id } = await params;
  return <OfferingDetail id={id} />;
}
