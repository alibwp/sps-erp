"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_ROLE, getRole, isRoleId, type Role, type RoleId } from "@/lib/roles";

// The demo session: the role picked at sign-in, kept in this browser.
// It decides what the app shows, not what anyone may do. Real access
// control arrives with the backend's authentication.

const STORAGE_KEY = "sps-session-role";
const EVENT = "sps-session-change";

function readRole(): RoleId {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isRoleId(stored) ? stored : DEFAULT_ROLE;
  } catch {
    return DEFAULT_ROLE;
  }
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  // Another tab signing in or out changes this tab too.
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function write(role: RoleId | null) {
  try {
    if (role) window.localStorage.setItem(STORAGE_KEY, role);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Blocked storage: the session simply falls back to the default role.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function signIn(role: RoleId) {
  write(role);
}

export function signOut() {
  write(null);
}

/**
 * The signed-in role. `ready` is false during server rendering, where the
 * browser's stored role cannot be read; `role` is then the default role.
 */
export function useSession(): { ready: boolean; role: Role } {
  const id = useSyncExternalStore<RoleId | null>(subscribe, readRole, () => null);
  return { ready: id !== null, role: getRole(id ?? DEFAULT_ROLE) };
}
