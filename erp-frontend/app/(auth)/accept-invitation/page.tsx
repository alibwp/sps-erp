import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { AcceptInvitationForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Accept invitation" };

export default function AcceptInvitationPage() {
  return (
    <AuthCard
      title="You're invited"
      description="SPS Army School invited you to SPS ERP. Choose a password to set up your account."
    >
      <AcceptInvitationForm />
    </AuthCard>
  );
}
