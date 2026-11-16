import type { Metadata } from "next";
import { Suspense } from "react";
import { TemplateEditorScreen } from "@/components/organizations/template-editor";

export const metadata: Metadata = { title: "Calendar template" };

type Props = { params: Promise<{ id: string }> };

export default async function CalendarTemplatePage({ params }: Props) {
  const { id } = await params;
  return (
    <Suspense>
      <TemplateEditorScreen templateId={id} />
    </Suspense>
  );
}
