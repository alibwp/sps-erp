import { redirect } from "next/navigation";

// Invitation links open /invitations/{token}; without a token there is
// nothing to accept here.
export default function AcceptInvitationPage() {
  redirect("/login");
}
