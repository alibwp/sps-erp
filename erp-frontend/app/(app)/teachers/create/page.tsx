import type { Metadata } from "next";
import { AddPerson } from "@/components/people/accounts";

export const metadata: Metadata = { title: "Add teacher" };

export default function AddTeacherPage() {
  return <AddPerson presetRole="teacher" backHref="/teachers" backLabel="Teachers" />;
}
