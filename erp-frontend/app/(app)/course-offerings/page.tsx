import type { Metadata } from "next";
import { OfferingActions, OfferingList } from "@/components/teaching/offerings";
import { Page } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Subjects being taught" };

export default function CourseOfferingsPage() {
  return (
    <Page title="Subjects being taught" breadcrumbs={[{ label: "Subjects being taught" }]} actions={<OfferingActions />}>
      <OfferingList />
    </Page>
  );
}
