import type { Metadata } from "next";
import { CreateRole } from "@/components/people/roles";

export const metadata: Metadata = { title: "New role" };

export default function CreateRolePage() {
  return <CreateRole />;
}
