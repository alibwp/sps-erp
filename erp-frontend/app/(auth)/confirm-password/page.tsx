import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { ConfirmPasswordForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Confirm password" };

export default function ConfirmPasswordPage() {
  return (
    <AuthCard title="Confirm your password" description="This is a secure area. Please confirm your password before continuing.">
      <ConfirmPasswordForm />
    </AuthCard>
  );
}
