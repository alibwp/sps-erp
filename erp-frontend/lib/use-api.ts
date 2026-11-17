"use client";

// React hooks for talking to the backend as the signed-in person. Every call
// goes through authorizedApi(), so the access token, the working campus
// (X-School-Id) and the one-time token refresh are handled in one place.

import { useCallback, useEffect, useState } from "react";
import { authorizedApi, useAuth } from "@/components/auth/session";
import { ApiError, type ApiOptions } from "@/lib/api";

/** Any failure as an ApiError, so screens only handle one error type. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  return new ApiError(0, "Something went wrong. Please try again.");
}

/** The backend's message for a failure, ready to show to the person. */
export function messageOf(error: unknown): string {
  return toApiError(error).message;
}

/** The first message for each invalid field: { name: "Name is required." }. */
export function fieldErrorsOf(error: ApiError | null): Record<string, string> {
  const result: Record<string, string> = {};
  if (!error) return result;
  for (const [field, messages] of Object.entries(error.fields)) {
    if (messages.length > 0) result[field] = messages[0];
  }
  return result;
}

export type ApiQuery<T> = {
  data: T | undefined;
  error: ApiError | null;
  /** True until the first answer for the current path arrives. */
  loading: boolean;
  /** Ask the backend again, e.g. after a change. */
  reload: () => void;
};

type Answer<T> = { key: string; data?: T; error: ApiError | null };

/**
 * Reads `path` (e.g. "/v1/subjects?page=2") once the session is ready, and
 * again whenever the path, the working campus or term, or reload() changes it. Pass
 * null to skip the call.
 *
 * keepPrevious: keep showing the last answer while the next one loads, so a
 * table does not flash empty between pages.
 */
export function useApiQuery<T>(path: string | null, { keepPrevious = false } = {}): ApiQuery<T> {
  const session = useAuth();
  const signedIn = session.status === "signed-in";
  const schoolId = signedIn ? session.schoolId : null;
  // The backend answers for the saved working term, so a new term means new data.
  const periodId = signedIn ? (session.working?.academicPeriod?.id ?? "") : "";
  const [version, setVersion] = useState(0);
  const [answer, setAnswer] = useState<Answer<T> | null>(null);

  // Everything that should trigger a new request, in one comparable value.
  const key = path !== null && signedIn ? `${schoolId ?? ""}|${periodId}|${version}|${path}` : null;

  useEffect(() => {
    if (key === null || path === null) return;
    let current = true;
    authorizedApi<T>(path).then(
      (data) => {
        if (current) setAnswer({ key, data, error: null });
      },
      (error: unknown) => {
        if (current) setAnswer({ key, error: toApiError(error) });
      },
    );
    return () => {
      current = false;
    };
  }, [key, path]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);

  const fresh = answer !== null && answer.key === key ? answer : null;
  const shown = fresh ?? (keepPrevious ? answer : null);
  return {
    data: shown?.data,
    error: fresh?.error ?? null,
    loading: path !== null && fresh === null,
    reload,
  };
}

/**
 * Reads several paths at once (e.g. one count per class) and answers when all
 * have. The first failure becomes `error`. Pass null to skip.
 */
export function useApiQueries<T>(paths: readonly string[] | null): ApiQuery<T[]> {
  const session = useAuth();
  const signedIn = session.status === "signed-in";
  const schoolId = signedIn ? session.schoolId : null;
  const periodId = signedIn ? (session.working?.academicPeriod?.id ?? "") : "";
  const [version, setVersion] = useState(0);
  const [answer, setAnswer] = useState<Answer<T[]> | null>(null);
  const joined = paths ? paths.join("\n") : null;
  const key = joined !== null && signedIn ? `${schoolId ?? ""}|${periodId}|${version}|${joined}` : null;

  useEffect(() => {
    if (key === null || joined === null) return;
    let current = true;
    const list = joined === "" ? [] : joined.split("\n");
    Promise.all(list.map((path) => authorizedApi<T>(path))).then(
      (data) => {
        if (current) setAnswer({ key, data, error: null });
      },
      (error: unknown) => {
        if (current) setAnswer({ key, error: toApiError(error) });
      },
    );
    return () => {
      current = false;
    };
  }, [key, joined]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);
  const fresh = answer !== null && answer.key === key ? answer : null;
  return { data: (fresh ?? answer)?.data, error: fresh?.error ?? null, loading: key !== null && fresh === null, reload };
}

export type Sent<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export type ApiMutation = {
  /**
   * Sends one change and answers { ok: true, data } or { ok: false, error }.
   * A failure also stays in `error` and `fieldErrors` for the form to show.
   */
  send: <T = unknown>(path: string, options: Omit<ApiOptions, "token">) => Promise<Sent<T>>;
  submitting: boolean;
  error: ApiError | null;
  /** Backend validation messages by field name. */
  fieldErrors: Record<string, string>;
  /** Forget the last failure (e.g. when the form is edited again). */
  clear: () => void;
};

/** Sends changes (POST, PUT, PATCH, DELETE) and keeps their state for a form. */
export function useApiMutation(): ApiMutation {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const send = useCallback(async <T = unknown,>(path: string, options: Omit<ApiOptions, "token">): Promise<Sent<T>> => {
    setSubmitting(true);
    setError(null);
    try {
      const data = await authorizedApi<T>(path, options);
      return { ok: true, data };
    } catch (failure) {
      const apiError = toApiError(failure);
      setError(apiError);
      return { ok: false, error: apiError };
    } finally {
      setSubmitting(false);
    }
  }, []);

  const clear = useCallback(() => setError(null), []);

  return { send, submitting, error, fieldErrors: fieldErrorsOf(error), clear };
}
