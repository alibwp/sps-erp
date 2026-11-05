"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, X } from "lucide-react";
import { useState } from "react";
import { APP_NAME, Logo } from "@/components/layout/logo";
import { useSidebar } from "@/components/layout/sidebar-context";
import { Select } from "@/components/ui/form";
import { Avatar } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { CURRENT_USER, SCHOOL } from "@/lib/mock";
import { isActive, navigation, type NavItem, type NavLink } from "@/lib/nav";
import { cn } from "@/lib/utils";

const CAMPUSES = ["SPS Army School — Main Campus", "SPS Army School — Westridge", "SPS Girls Campus"];

const linkBase =
  "flex h-9 w-full min-w-0 items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-ring [&>svg]:size-4 [&>svg]:shrink-0";
const linkActive = "bg-sidebar-accent font-medium text-sidebar-accent-foreground";

function SidebarBody({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const toast = useToast();

  return (
    <>
      <div className={cn("flex min-w-0 flex-col gap-2 p-2", collapsed ? "items-center" : "px-3 pt-3")}>
        <Link href="/dashboard" onClick={onNavigate} className="flex h-10 min-w-0 items-center gap-2" aria-label="Home">
          <Logo className="size-8" />
          {!collapsed && <span className="truncate text-sm font-semibold">{APP_NAME}</span>}
        </Link>
        {!collapsed && (
          <label className="flex min-w-0 flex-col gap-1">
            <span className="px-1 text-xs font-medium text-sidebar-foreground/70">Working school</span>
            <Select
              className="h-10 bg-background text-xs"
              defaultValue={CAMPUSES[0]}
              onChange={(event) => toast({ title: "Working school changed", description: event.target.value })}
            >
              {CAMPUSES.map((campus) => (
                <option key={campus}>{campus}</option>
              ))}
            </Select>
          </label>
        )}
      </div>

      <nav aria-label="Main" className="beautify-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-4">
        {navigation.map((group) => (
          <div key={group.label} className="py-2">
            {collapsed ? (
              <div className="mx-2 mb-2 border-t border-sidebar-border first:hidden" aria-hidden />
            ) : (
              <p className="flex h-8 items-center px-2 text-xs font-medium text-sidebar-foreground/70">{group.label}</p>
            )}
            <ul className="grid gap-0.5">
              {group.items.map((item) => (
                <li key={item.label}>
                  <SidebarItem item={item} pathname={pathname} collapsed={collapsed} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className={cn("grid gap-1 border-t border-sidebar-border p-2", collapsed && "justify-items-center")}>
        <Link
          href="/profile"
          onClick={onNavigate}
          title={collapsed ? CURRENT_USER.name : undefined}
          className={cn(linkBase, "h-11", collapsed && "w-10 justify-center px-0", isActive(pathname, "/profile") && linkActive)}
        >
          <Avatar name={CURRENT_USER.name} size="sm" />
          {!collapsed && (
            <span className="min-w-0">
              <span className="block truncate">{CURRENT_USER.name}</span>
              <span className="block truncate text-xs text-sidebar-foreground/70">{SCHOOL.name}</span>
            </span>
          )}
        </Link>
      </div>
    </>
  );
}

function SidebarItem({
  item,
  pathname,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const { toggleExpanded } = useSidebar();
  const childActive = "children" in item && item.children.some((child) => isActive(pathname, child.href));
  const [open, setOpen] = useState(childActive);

  if (!("children" in item)) {
    return <SidebarLink link={item} active={isActive(pathname, item.href)} collapsed={collapsed} onNavigate={onNavigate} />;
  }

  const Icon = item.icon;

  if (collapsed) {
    // On the icon rail a group opens the full sidebar so its pages can be read.
    return (
      <button
        type="button"
        title={item.label}
        aria-label={item.label}
        onClick={() => {
          setOpen(true);
          toggleExpanded();
        }}
        className={cn(linkBase, "w-10 justify-center px-0", childActive && linkActive)}
      >
        <Icon />
      </button>
    );
  }

  return (
    <div>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className={cn(linkBase, childActive && "font-medium")}>
        <Icon />
        <span className="truncate">{item.label}</span>
        <ChevronDown className={cn("ml-auto size-3.5 transition-transform", !open && "-rotate-90")} aria-hidden />
      </button>
      {open && (
        <ul className="ml-4 mt-0.5 grid gap-0.5 border-l border-sidebar-border pl-2">
          {item.children.map((child) => (
            <li key={child.href}>
              <SidebarLink link={child} active={isActive(pathname, child.href)} collapsed={false} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SidebarLink({
  link,
  active,
  collapsed,
  onNavigate,
}: {
  link: NavLink;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const Icon = link.icon;
  return (
    <Link
      href={link.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={collapsed ? link.label : undefined}
      aria-label={collapsed ? link.label : undefined}
      className={cn(linkBase, collapsed && "w-10 justify-center px-0", active && linkActive)}
    >
      <Icon />
      {!collapsed && <span className="truncate">{link.label}</span>}
    </Link>
  );
}

export function Sidebar() {
  const { expanded, mobileOpen, setMobileOpen } = useSidebar();

  return (
    <>
      <aside
        data-print-hide
        className={cn(
          "sticky top-0 hidden h-svh shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 md:flex",
          expanded ? "w-64" : "w-14",
        )}
      >
        <SidebarBody collapsed={!expanded} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-[90] md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="animate-fade-in absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="animate-slide-in-left absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-sidebar-border bg-sidebar shadow-xl">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-2 top-3 inline-flex size-10 items-center justify-center rounded-md hover:bg-sidebar-accent"
              aria-label="Close menu"
            >
              <X className="size-4" />
            </button>
            <SidebarBody collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
