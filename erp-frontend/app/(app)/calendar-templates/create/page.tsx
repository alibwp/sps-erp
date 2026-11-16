import type { Metadata } from "next";
import { Suspense } from "react";
import { TemplateEditorScreen } from "@/components/organizations/template-editor";

export const metadata: Metadata = { title: "New calendar template" };

export default function CreateCalendarTemplatePage() {
  return (
    <Suspense>
      <TemplateEditorScreen />
    </Suspense>
  );
}
