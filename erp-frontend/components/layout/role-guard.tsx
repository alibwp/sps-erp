"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "@/components/auth/session";
import { ButtonLink } from "@/components/ui/button";
import { canChange, canOpen } from "@/lib/nav";

/**
 * Show an add or edit action only to a role that may change the records under
 * `href`. Server-rendered pages wrap their buttons in this.
 */
export function IfCanChange({ href, children }: { href: string; children: ReactNode }) {
  const { ready, role } = useSession();
  if (!ready || !canChange(role.id, href)) return null;
  return <>{children}</>;
}

/**
 * Keep a role off the pages its sidebar does not list, even when the address
 * is typed. This only shapes the demo; the backend enforces real access.
 */
export function RoleGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { ready, role } = useSession();

  if (!ready || canOpen(role.id, pathname)) return <>{children}</>;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <div className="flex items-center gap-4">
        <span className="text-4xl font-semibold tabular-nums tracking-tight">403</span>
        <span className="h-10 w-px bg-border" aria-hidden />
        <h1 className="text-left text-lg font-medium">Access denied</h1>
      </div>
      <p className="max-w-md text-sm text-muted-foreground">
        Your account cannot open this page. Ask your school administrator if you need it.
      </p>
      <ButtonLink href="/dashboard">Back to dashboard</ButtonLink>
    </div>
  );
}
