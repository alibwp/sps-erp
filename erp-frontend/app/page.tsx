import { redirect } from "next/navigation";

// The app opens on the sign-in screen; signing in leads to the dashboard.
export default function Home() {
  redirect("/login");
}
