"use client";

import type { ReactNode } from "react";
import { CommandPalette } from "@/components/layout/command-palette";
import { Header } from "@/components/layout/header";
import { PeriodBar } from "@/components/layout/period-bar";
import { Sidebar } from "@/components/layout/sidebar";
import { SidebarProvider } from "@/components/layout/sidebar-context";
import { ToastProvider } from "@/components/ui/toast";

/** The signed-in layout: sidebar, header, working-period bar and content. */
export function AppShell({ children }: { children: ReactNode }) {
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
            <main className="flex min-w-0 flex-1 flex-col">{children}</main>
          </div>
        </div>
        <CommandPalette />
      </SidebarProvider>
    </ToastProvider>
  );
}
