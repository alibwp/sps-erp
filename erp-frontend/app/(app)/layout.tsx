import { Suspense, type ReactNode } from "react";
import { AppShell, ShellLoading } from "@/components/layout/app-shell";

export default function SignedInLayout({ children }: { children: ReactNode }) {
  // The shell reads the address (usePathname). On pages whose id is only known
  // at request time (a backend record's UUID), that suspends while
  // prerendering, so the loading screen it shows anyway is the fallback.
  return (
    <Suspense fallback={<ShellLoading />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
