import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Login" };

export default function LoginPage() {
  return (
    <AuthCard
      title="Welcome back"
      description="Sign in to continue to SPS ERP."
      footer={
        <Link href="/forgot-password" className="font-medium text-foreground underline-offset-4 hover:underline">
          Forgot your password?
        </Link>
      }
    >
      <LoginForm />
    </AuthCard>
  );
}
