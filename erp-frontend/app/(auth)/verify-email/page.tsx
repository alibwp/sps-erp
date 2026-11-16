import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { VerifyEmailForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Verify email" };

export default function VerifyEmailPage() {
  return (
    <AuthCard
      title="Verify your email"
      description="Open the link we emailed you to confirm your address. If it did not arrive, we can send another."
    >
      <VerifyEmailForm />
    </AuthCard>
  );
}
