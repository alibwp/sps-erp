import type { Metadata } from "next";
import { CreateOffering } from "@/components/teaching/offerings";

export const metadata: Metadata = { title: "Offer a subject" };

export default function CreateCourseOfferingPage() {
  return <CreateOffering />;
}
