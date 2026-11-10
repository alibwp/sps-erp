import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { TwoFactorForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Two-factor authentication" };

export default function TwoFactorPage() {
  return (
    <AuthCard
      title="Two-factor authentication"
      description="Enter the six-digit code from your authenticator app, or one of your recovery codes."
    >
      <TwoFactorForm />
    </AuthCard>
  );
}
