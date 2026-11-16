import type { Metadata } from "next";
import { BulkOfferings } from "@/components/teaching/offerings";

export const metadata: Metadata = { title: "Offer to several classes" };

export default function BulkCourseOfferingsPage() {
  return <BulkOfferings />;
}
