import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { InvitationForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Accept invitation" };

// The link in the invitation email: FRONTEND_URL/invitations/{token}.
export default function InvitationPage({ params }: PageProps<"/invitations/[token]">) {
  return (
    <AuthCard title="You're invited" description="Choose a password to set up your SPS ERP account.">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Checking your invitation…</p>}>
        <Invitation params={params} />
      </Suspense>
    </AuthCard>
  );
}

async function Invitation({ params }: Pick<PageProps<"/invitations/[token]">, "params">) {
  const { token } = await params;
  return <InvitationForm token={token} />;
}
