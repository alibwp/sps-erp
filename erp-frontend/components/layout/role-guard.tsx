"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAccess, useSession } from "@/components/auth/session";
import { ButtonLink } from "@/components/ui/button";
import { canChange, canOpen } from "@/lib/nav";

/**
 * Show an add or edit action only to someone who may change the records
 * under `href`: by their permissions at the working campus on pages connected
 * to the backend, by their role elsewhere. Server-rendered pages wrap their
 * buttons in this.
 */
export function IfCanChange({ href, children }: { href: string; children: ReactNode }) {
  const { ready, role } = useSession();
  const access = useAccess();
  if (!ready || !canChange(role.id, href, access)) return null;
  return <>{children}</>;
}

/**
 * Keep a person off the pages their sidebar does not list, even when the
 * address is typed. This only shapes the screens; the backend checks every
 * request.
 */
export function RoleGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { ready, role } = useSession();
  const access = useAccess();

  if (!ready || canOpen(role.id, pathname, access)) return <>{children}</>;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <div className="flex items-center gap-4">
        <span className="text-4xl font-semibold tabular-nums tracking-tight">403</span>
        <span className="h-10 w-px bg-border" aria-hidden />
        <h1 className="text-left text-lg font-medium">Access denied</h1>
      </div>
      <p className="max-w-md text-sm text-muted-foreground">
        Your account cannot open this page at this campus. Ask your school administrator if you need it.
      </p>
      <ButtonLink href="/dashboard">Back to dashboard</ButtonLink>
    </div>
  );
}
