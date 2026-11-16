"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { Access } from "@/lib/access";
import { api, ApiError, type ApiOptions } from "@/lib/api";
import { roleFor, type Role, type RoleId } from "@/lib/roles";

// The signed-in session. The access token lives in memory only; the backend's
// refresh cookie (httpOnly, on this site through the /api proxy) restores the
// session after a reload.

type AccessToken = { accessToken: string; tokenType: "Bearer"; expiresIn: number };
type TwoFactorRequired = { twoFactorRequired: true; challengeToken: string };
/** GET /v1/me: the fields the app shell needs (the profile page reads the rest). */
export type Me = { id: string; name: string; email: string; profilePhotoUrl: string | null };
export type Campus = {
  id: string;
  name: string;
  code: string;
  isPrimary: boolean;
  organization: { id: string; name: string };
};
/** Shared states of academic years and periods. */
export type AcademicStatus = "draft" | "scheduled" | "open" | "closing" | "closed" | "archived";
export type AcademicYear = { id: string; name: string; status: AcademicStatus; isCampusDefault: boolean };
export type AcademicPeriod = {
  id: string;
  academicYearId: string;
  parentId: string | null;
  displayName: string;
  type: string;
  startsOn: string | null;
  endsOn: string | null;
  status: AcademicStatus;
};
/** The working year and term at the working campus (GET /v1/me/context → working). */
export type Working = {
  academicYear: AcademicYear | null;
  academicPeriod: AcademicPeriod | null;
  /** Set when the campus calendar is ambiguous; period-based pages answer 409 until it is fixed. */
  periodError: string | null;
};
type Context = {
  defaultSchoolId: string | null;
  campuses: Campus[];
  working: (Working & { schoolId: string }) | null;
};
type MyPermissions = { schoolId: string; roles: Array<{ name: string }>; permissions: string[] };

export type SignedIn = {
  status: "signed-in";
  accessToken: string;
  user: Me;
  /** The working campus, sent as X-School-Id; null when the person has none. */
  schoolId: string | null;
  campuses: Campus[];
  /** The working year and term at that campus; null without a campus. */
  working: Working | null;
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

// ------------------------------------------------------------ Working campus

// The campus a person last worked at is remembered per account in this
// browser, so a reload or the next sign-in opens the same campus. It is only a
// convenience: a campus the person has lost access to falls back to the
// backend's default.
const CAMPUS_KEY = "sps.working-campus.";

function rememberedCampus(userId: string): string | null {
  try {
    return window.localStorage.getItem(CAMPUS_KEY + userId);
  } catch {
    return null;
  }
}

function rememberCampus(userId: string, schoolId: string): void {
  try {
    window.localStorage.setItem(CAMPUS_KEY + userId, schoolId);
  } catch {
    // Storage blocked (private window): the default campus is used next time.
  }
}

function workingOf(context: Context): Working | null {
  if (!context.working) return null;
  const { academicYear, academicPeriod, periodError } = context.working;
  return { academicYear, academicPeriod, periodError };
}

/** The session fields that depend on the working campus. */
type CampusState = Pick<SignedIn, "working" | "roleId" | "roleLabel" | "roleNames" | "permissions">;

function campusStateOf(context: Context | null, mine: MyPermissions | null): CampusState {
  const roleNames = mine ? mine.roles.map((role) => role.name) : [];
  const role = roleFor(roleNames);
  return {
    working: context ? workingOf(context) : null,
    roleId: role.id,
    roleLabel: role.label,
    roleNames,
    permissions: mine?.permissions ?? [],
  };
}

// Reads who the person is, their campuses, and their year, term and roles at
// the working campus (the remembered one, else the backend's default).
async function establish(accessToken: string): Promise<void> {
  const [me, context] = await Promise.all([
    api<Me>("/v1/me", { token: accessToken }),
    api<Context>("/v1/me/context", { token: accessToken }),
  ]);
  const remembered = rememberedCampus(me.id);
  const schoolId = context.campuses.some((campus) => campus.id === remembered) ? remembered : context.defaultSchoolId;

  let campus = campusStateOf(null, null);
  if (schoolId) {
    // Without X-School-Id the context answers for the default campus, so it is
    // only asked again when the remembered campus is another one.
    const [atCampus, mine] = await Promise.all([
      schoolId === context.defaultSchoolId ? context : api<Context>("/v1/me/context", { token: accessToken, schoolId }),
      api<MyPermissions>("/v1/me/permissions", { token: accessToken, schoolId }),
    ]);
    campus = campusStateOf(atCampus, mine);
  }

  set({
    status: "signed-in",
    accessToken,
    user: userOf(me),
    schoolId,
    campuses: context.campuses,
    ...campus,
  });
}

// Only the latest switch may land: a slower answer for a campus picked earlier
// must not overwrite the one picked last.
let switchTicket = 0;

/**
 * Makes `schoolId` the working campus: reads the year, term, roles and
 * permissions there, then swaps them in at once. Every page reading through
 * useApiQuery asks again because the campus is part of its key.
 */
export async function switchCampus(schoolId: string): Promise<void> {
  if (state.status !== "signed-in" || state.schoolId === schoolId) return;
  if (!state.campuses.some((campus) => campus.id === schoolId)) {
    throw new ApiError(403, "You do not have access to that campus.");
  }
  const ticket = ++switchTicket;
  const [context, mine] = await Promise.all([
    authorizedApi<Context>("/v1/me/context", { schoolId }),
    authorizedApi<MyPermissions>("/v1/me/permissions", { schoolId }),
  ]);
  if (ticket !== switchTicket || state.status !== "signed-in") return;
  rememberCampus(state.user.id, schoolId);
  set({ ...state, schoolId, campuses: context.campuses, ...campusStateOf(context, mine) });
}

/**
 * Reads the campuses and the working year and term again, after something
 * that changes them (a campus renamed in school settings, for one).
 */
export async function refreshContext(): Promise<void> {
  if (state.status !== "signed-in" || !state.schoolId) return;
  const schoolId = state.schoolId;
  const context = await authorizedApi<Context>("/v1/me/context", { schoolId });
  if (state.status === "signed-in" && state.schoolId === schoolId) {
    set({ ...state, campuses: context.campuses, working: workingOf(context) });
  }
}

/**
 * Saves the working year and/or term at the working campus
 * (PUT /v1/me/context). The backend checks "set academic year" and
 * "set academic period"; the new choice applies to every later request.
 */
export async function setWorkingPeriod(input: { academicYearId?: string; academicPeriodId?: string }): Promise<Working | null> {
  if (state.status !== "signed-in" || !state.schoolId) throw new ApiError(400, "Pick a campus first.");
  const schoolId = state.schoolId;
  const context = await authorizedApi<Context>("/v1/me/context", { method: "PUT", body: input, schoolId });
  const working = workingOf(context);
  // Ignore the answer when the person moved to another campus meanwhile.
  if (state.status === "signed-in" && state.schoolId === schoolId) set({ ...state, working });
  return working;
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

function userOf(me: Me): Me {
  return { id: me.id, name: me.name, email: me.email, profilePhotoUrl: me.profilePhotoUrl };
}

/**
 * Shows a changed profile (the answer of PATCH /v1/me or the photo routes)
 * everywhere the app shows the signed-in person.
 */
export function updateUser(me: Me): void {
  if (state.status === "signed-in") set({ ...state, user: userOf(me) });
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
 * Some refusals ask the person to do something first. The backend answers
 * email_not_verified on administration routes until the address is
 * verified, and password_confirmation_required for sensitive actions (2FA
 * changes, signing out other sessions) without a recent password
 * confirmation. Both open the page that settles it; the confirmation page
 * returns to where the person was.
 */
function sendToGate(error: ApiError) {
  if (typeof window === "undefined" || !navigate) return;
  const { pathname, search } = window.location;
  if (error.code === "email_not_verified" && pathname !== "/verify-email") {
    navigate("/verify-email");
  } else if (error.code === "password_confirmation_required" && pathname !== "/confirm-password") {
    navigate(`/confirm-password?next=${encodeURIComponent(pathname + search)}`);
  }
}

// The app's client-side navigation, registered by the signed-in layout, so a
// redirect keeps the in-memory session instead of reloading the page.
let navigate: ((href: string) => void) | null = null;

/** Lets authorizedApi() open pages; AppShell registers Next's router here. */
export function useGateNavigation(push: (href: string) => void) {
  useEffect(() => {
    navigate = push;
    return () => {
      if (navigate === push) navigate = null;
    };
  }, [push]);
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
    if (error instanceof ApiError) sendToGate(error);
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

export type WorkingContext = {
  ready: boolean;
  schoolId: string | null;
  campus: Campus | null;
  campuses: Campus[];
  working: Working | null;
  /** True when the person holds `permission` at the working campus. */
  can: (permission: string) => boolean;
};

const NO_CONTEXT: WorkingContext = {
  ready: false,
  schoolId: null,
  campus: null,
  campuses: [],
  working: null,
  can: () => false,
};

/** The working campus, year and term, and what the person may do there. */
export function useWorkingContext(): WorkingContext {
  const session = useAuth();
  if (session.status !== "signed-in") return NO_CONTEXT;
  const { schoolId, campuses, working, permissions } = session;
  return {
    ready: true,
    schoolId,
    campus: campuses.find((campus) => campus.id === schoolId) ?? null,
    campuses,
    working,
    can: (permission) => permissions.includes(permission),
  };
}

/**
 * What the person holds at the working campus, for lib/access.ts. Undefined
 * until the session is known. The same object is kept while the session
 * does not change, so it is safe in dependency lists.
 */
export function useAccess(): Access | undefined {
  const session = useAuth();
  const permissions = session.status === "signed-in" ? session.permissions : null;
  const roleNames = session.status === "signed-in" ? session.roleNames : null;
  return useMemo(
    () => (permissions && roleNames ? { permissions: new Set(permissions), roleNames } : undefined),
    [permissions, roleNames],
  );
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
      photoUrl: session.user.profilePhotoUrl,
    },
  };
}
