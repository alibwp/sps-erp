"use client";

import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";

type SidebarState = {
  /** Desktop: full width (true) or icon rail (false). */
  expanded: boolean;
  toggleExpanded: () => void;
  /** Mobile: drawer open. */
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  /** Open the drawer on small screens, collapse the rail on large ones. */
  toggle: () => void;
  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;
};

const SidebarContext = createContext<SidebarState | null>(null);

const STORAGE_KEY = "sidebar";
const EVENT = "sps-sidebar-change";

function readExpanded() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "collapsed";
  } catch {
    return true;
  }
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  return () => window.removeEventListener(EVENT, callback);
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const expanded = useSyncExternalStore(subscribe, readExpanded, () => true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);

  const toggleExpanded = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, readExpanded() ? "collapsed" : "expanded");
    } catch {
      // Ignore blocked storage.
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  const toggle = useCallback(() => {
    if (window.matchMedia("(min-width: 768px)").matches) toggleExpanded();
    else setMobileOpen((open) => !open);
  }, [toggleExpanded]);

  const value = useMemo(
    () => ({ expanded, toggleExpanded, mobileOpen, setMobileOpen, toggle, commandOpen, setCommandOpen }),
    [expanded, toggleExpanded, mobileOpen, toggle, commandOpen],
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) throw new Error("useSidebar must be used inside SidebarProvider");
  return context;
}
