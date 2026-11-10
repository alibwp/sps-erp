"use client";

import { useRouter } from "next/navigation";
import { ChevronDown, LogOut, Maximize, Minimize, Monitor, Moon, PanelLeft, Search, Sun, UserRound } from "lucide-react";
import { useSyncExternalStore } from "react";
import { setTheme, useTheme } from "@/components/layout/theme";
import { useSidebar } from "@/components/layout/sidebar-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuLink,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Avatar, Kbd } from "@/components/ui/misc";
import { signOut, useSession } from "@/components/auth/session";
import { SCHOOL } from "@/lib/mock";
import { cn } from "@/lib/utils";

function subscribeFullscreen(callback: () => void) {
  document.addEventListener("fullscreenchange", callback);
  return () => document.removeEventListener("fullscreenchange", callback);
}

export function Header() {
  const router = useRouter();
  const theme = useTheme();
  const { toggle, setCommandOpen } = useSidebar();
  const { role: user } = useSession();
  const fullscreen = useSyncExternalStore(subscribeFullscreen, () => document.fullscreenElement !== null, () => false);

  const themes = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ] as const;

  return (
    <header
      data-print-hide
      className="sticky top-0 z-30 flex h-14 w-full items-center justify-between gap-2 border-b bg-background/95 px-3 backdrop-blur md:px-6"
    >
      <div className="flex min-w-0 items-center gap-2">
        <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle sidebar" className="size-10">
          <PanelLeft />
        </Button>
        <span className="hidden text-sm font-semibold tracking-tight sm:block">SPS ERP</span>
        <span className="hidden min-w-0 items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground lg:inline-flex">
          <span className="size-1.5 rounded-full bg-success" aria-hidden />
          <span className="truncate">{SCHOOL.name}</span>
        </span>
      </div>

      <div className="flex h-full shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => setCommandOpen(true)}
          className="hidden h-9 items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted sm:flex"
          aria-label="Search pages and features"
        >
          <Search className="size-4" />
          <span>Search</span>
          <Kbd className="ml-2 bg-background">Ctrl K</Kbd>
        </button>
        <Button variant="ghost" size="icon" className="size-10 sm:hidden" onClick={() => setCommandOpen(true)} aria-label="Search pages and features">
          <Search />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="hidden size-10 sm:inline-flex"
          aria-label={fullscreen ? "Exit full screen" : "Full screen mode"}
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen();
            else void document.documentElement.requestFullscreen?.();
          }}
        >
          {fullscreen ? <Minimize /> : <Maximize />}
        </Button>

        <DropdownMenu
          trigger={
            <>
              <Sun className="size-4 dark:hidden" />
              <Moon className="hidden size-4 dark:block" />
            </>
          }
          triggerLabel="Open theme selection"
          triggerClassName="size-10"
          className="w-40"
        >
          {themes.map(({ value, label, icon: Icon }) => (
            <DropdownMenuItem
              key={value}
              onClick={() => setTheme(value)}
              aria-label={`Select ${label.toLowerCase()} theme`}
              className={cn(theme === value && "bg-accent")}
            >
              <Icon /> {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenu>

        <DropdownMenu
          trigger={
            <>
              <Avatar name={user.name} size="sm" />
              <span className="hidden max-w-40 truncate text-left text-sm font-medium lg:block">{user.name}</span>
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </>
          }
          triggerLabel="Account menu"
          triggerClassName="ml-1 h-10 gap-2 px-2"
          className="w-72"
        >
          <div className="border-b p-3">
            <p className="font-medium">{user.name}</p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
            <p className="mt-1 text-xs font-medium text-muted-foreground">{user.label}</p>
          </div>
          <DropdownMenuLabel>
            Academic year: {SCHOOL.academicYear}
            <br />
            Working term: {SCHOOL.term}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuLink href="/profile">
            <UserRound /> Profile
          </DropdownMenuLink>
          <DropdownMenuItem
            onClick={() => {
              signOut();
              router.push("/login");
            }}
          >
            <LogOut /> Log out
          </DropdownMenuItem>
        </DropdownMenu>
      </div>
    </header>
  );
}
