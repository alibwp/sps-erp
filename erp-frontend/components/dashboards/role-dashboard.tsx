"use client";

import type { ReactNode } from "react";
import { useSession } from "@/components/auth/session";
import type { RoleId } from "@/lib/roles";

/**
 * Show the dashboard built for the signed-in role. Roles without their own
 * dashboard yet see `fallback`. The dashboards arrive already rendered on the
 * server; this only chooses which one to show.
 */
export function RoleDashboard({
  dashboards,
  fallback,
}: {
  dashboards: Partial<Record<RoleId, ReactNode>>;
  fallback: ReactNode;
}) {
  const { ready, role } = useSession();

  if (!ready) return <DashboardSkeleton />;
  return <>{dashboards[role.id] ?? fallback}</>;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-10" aria-busy="true" aria-label="Loading dashboard">
      <div className="space-y-2">
        <div className="h-3 w-40 animate-pulse rounded bg-muted" />
        <div className="h-7 w-72 animate-pulse rounded bg-muted" />
      </div>
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-4 xl:grid-cols-7">
        {Array.from({ length: 7 }, (_, index) => (
          <div key={index} className="h-14 animate-pulse rounded-md bg-muted/60" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-lg border bg-muted/40" />
    </div>
  );
}
