"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CircleAlert } from "lucide-react";
import { useAuth } from "@/components/auth/session";
import { CommandPalette } from "@/components/layout/command-palette";
import { Header } from "@/components/layout/header";
import { PeriodBar } from "@/components/layout/period-bar";
import { RoleGuard } from "@/components/layout/role-guard";
import { Sidebar } from "@/components/layout/sidebar";
import { SidebarProvider } from "@/components/layout/sidebar-context";
import { Alert } from "@/components/ui/misc";
import { ToastProvider } from "@/components/ui/toast";

/**
 * The signed-in layout: sidebar, header, working-period bar and content.
 * Without a session it sends the person to the login page.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const session = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (session.status === "signed-out") router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [session.status, pathname, router]);

  if (session.status !== "signed-in") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background" aria-busy="true">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <ToastProvider>
      <SidebarProvider>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring"
        >
          Skip to content
        </a>
        <div className="flex min-h-screen bg-background text-foreground">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <Header />
            <PeriodBar />
            <main className="flex min-w-0 flex-1 flex-col">
              {session.schoolId === null && (
                <Alert tone="warning" icon={CircleAlert} className="m-4 sm:m-6">
                  Your account is not linked to a campus yet. Ask your school administrator for access.
                </Alert>
              )}
              <RoleGuard>{children}</RoleGuard>
            </main>
          </div>
        </div>
        <CommandPalette />
      </SidebarProvider>
    </ToastProvider>
  );
}
