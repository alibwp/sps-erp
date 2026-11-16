import type { Metadata } from "next";
import { AdmitStudent } from "@/components/students/students";

export const metadata: Metadata = { title: "Admit student" };

export default function AdmitStudentPage() {
  return <AdmitStudent />;
}
