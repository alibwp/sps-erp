import type { Metadata } from "next";
import { ErrorScreen } from "@/components/error-screen";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <ErrorScreen
      code="404"
      title="Page not found"
      description="The page you are looking for does not exist, or it has been moved."
    />
  );
}
