import type { Metadata } from "next";
import { CreateYear } from "@/components/academic/years";

export const metadata: Metadata = { title: "New school year" };

export default function CreateAcademicYearPage() {
  return <CreateYear />;
}
