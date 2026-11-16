import type { Metadata } from "next";
import { AddPerson } from "@/components/people/accounts";

export const metadata: Metadata = { title: "Add person" };

export default function AddPersonPage() {
  return <AddPerson />;
}
