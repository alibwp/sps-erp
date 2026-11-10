import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Forgot your password?"
      description="Enter your email address and we will send you a link to choose a new one."
      footer={
        <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
          Back to login
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
