"use client";

import { useEffect, useSyncExternalStore } from "react";
import { api, ApiError, type ApiOptions } from "@/lib/api";
import { roleFor, type Role, type RoleId } from "@/lib/roles";

// The signed-in session. The access token lives in memory only; the backend's
// refresh cookie (httpOnly, on this site through the /api proxy) restores the
// session after a reload.

type AccessToken = { accessToken: string; tokenType: "Bearer"; expiresIn: number };
type TwoFactorRequired = { twoFactorRequired: true; challengeToken: string };
type Me = { id: string; name: string; email: string };
export type Campus = { id: string; name: string; code: string; isPrimary: boolean };
type Context = { defaultSchoolId: string | null; campuses: Campus[] };
type MyPermissions = { schoolId: string; roles: Array<{ name: string }>; permissions: string[] };

export type SignedIn = {
  status: "signed-in";
  accessToken: string;
  user: Me;
  /** The working campus, sent as X-School-Id; null when the person has none. */
  schoolId: string | null;
  campuses: Campus[];
  roleId: RoleId;
  roleLabel: string;
  roleNames: string[];
  permissions: string[];
};

export type SessionState = { status: "loading" } | { status: "signed-out" } | SignedIn;

const LOADING: SessionState = { status: "loading" };
let state: SessionState = LOADING;
let restoring: Promise<void> | null = null;
// A login that still needs its two-factor code.
let challengeToken: string | null = null;
const listeners = new Set<() => void>();

function set(next: SessionState) {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Reads who the person is, their campuses, and their roles at the default one.
async function establish(accessToken: string): Promise<void> {
  const me = await api<Me>("/v1/me", { token: accessToken });
  const context = await api<Context>("/v1/me/context", { token: accessToken });
  const schoolId = context.defaultSchoolId;
  let roleNames: string[] = [];
  let permissions: string[] = [];
  if (schoolId) {
    const mine = await api<MyPermissions>("/v1/me/permissions", { token: accessToken, schoolId });
    roleNames = mine.roles.map((role) => role.name);
    permissions = mine.permissions;
  }
  const role = roleFor(roleNames);
  set({
    status: "signed-in",
    accessToken,
    user: { id: me.id, name: me.name, email: me.email },
    schoolId,
    campuses: context.campuses,
    roleId: role.id,
    roleLabel: role.label,
    roleNames,
    permissions,
  });
}

// A session the app cannot use (the account must change its password first,
// for one) is ended rather than left half open.
async function establishOrEnd(accessToken: string): Promise<void> {
  try {
    await establish(accessToken);
  } catch (error) {
    await api("/v1/auth/logout", { method: "POST" }).catch(() => undefined);
    set({ status: "signed-out" });
    throw error;
  }
}

/** Restores the session from the refresh cookie, once per page load. */
export function restoreSession(): Promise<void> {
  if (state.status !== "loading") return Promise.resolve();
  restoring ??= (async () => {
    try {
      const token = await api<AccessToken>("/v1/auth/refresh", { method: "POST" });
      await establish(token.accessToken);
    } catch {
      set({ status: "signed-out" });
    }
  })();
  return restoring;
}

/** Signs in; "two-factor" means the code page must finish it. */
export async function login(email: string, password: string): Promise<"signed-in" | "two-factor"> {
  const result = await api<AccessToken | TwoFactorRequired>("/v1/auth/login", {
    method: "POST",
    body: { email, password },
  });
  if ("twoFactorRequired" in result) {
    challengeToken = result.challengeToken;
    return "two-factor";
  }
  challengeToken = null;
  await establishOrEnd(result.accessToken);
  return "signed-in";
}

export function hasPendingChallenge(): boolean {
  return challengeToken !== null;
}

/** Finishes a login with a code from the authenticator app or a recovery code. */
export async function answerChallenge(answer: { code: string } | { recoveryCode: string }): Promise<void> {
  if (!challengeToken) throw new ApiError(401, "Your sign-in has expired. Please log in again.");
  const result = await api<AccessToken>("/v1/auth/two-factor-challenge", {
    method: "POST",
    body: { challengeToken, ...answer },
  });
  challengeToken = null;
  await establishOrEnd(result.accessToken);
}

/** Ends the session on the backend and here. */
export async function logout(): Promise<void> {
  try {
    await api("/v1/auth/logout", { method: "POST" });
  } finally {
    challengeToken = null;
    set({ status: "signed-out" });
  }
}

/**
 * Calls the API as the signed-in person at their working campus. An expired
 * access token is renewed once with the refresh cookie.
 */
export async function authorizedApi<T>(path: string, options: Omit<ApiOptions, "token"> = {}): Promise<T> {
  if (state.status !== "signed-in") throw new ApiError(401, "Please log in.");
  const session = state;
  const call = (token: string) =>
    api<T>(path, { schoolId: session.schoolId, ...options, token });
  try {
    return await call(session.accessToken);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    try {
      const fresh = await api<AccessToken>("/v1/auth/refresh", { method: "POST" });
      if (state.status === "signed-in") set({ ...state, accessToken: fresh.accessToken });
      return await call(fresh.accessToken);
    } catch (retryError) {
      if (retryError instanceof ApiError && retryError.status === 401) set({ status: "signed-out" });
      throw retryError;
    }
  }
}

/** The session, restored from the refresh cookie on first use. */
export function useAuth(): SessionState {
  const current = useSyncExternalStore(subscribe, () => state, () => LOADING);
  useEffect(() => {
    void restoreSession();
  }, []);
  return current;
}

const NOBODY: Role = { id: "student", label: "", name: "", email: "" };

/**
 * The signed-in person as the app shows them. `ready` is false until the
 * session is known; `role` is then a placeholder.
 */
export function useSession(): { ready: boolean; role: Role } {
  const session = useAuth();
  if (session.status !== "signed-in") return { ready: false, role: NOBODY };
  return {
    ready: true,
    role: {
      id: session.roleId,
      label: session.roleLabel,
      name: session.user.name,
      email: session.user.email,
    },
  };
}
