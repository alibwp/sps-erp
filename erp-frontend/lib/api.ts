// The browser calls the API on this site's own address; the Next.js server
// passes /api/... on to the backend (app/api/[...path]/route.ts).
export const API_URL = "/api";

/** An answer from the backend that was not a success, with its message. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string | null = null,
    readonly fields: Record<string, string[]> = {},
  ) {
    super(message);
  }
}

/** One page of a backend list: every list endpoint answers in this shape. */
export type Paginated<T> = { data: T[]; meta: { page: number; perPage: number; total: number } };

export type QueryValue = string | number | boolean | null | undefined;

/**
 * Adds a query string to `path`, leaving out empty values:
 * withQuery("/v1/subjects", { page: 2, search: "" }) → "/v1/subjects?page=2".
 */
export function withQuery(path: string, query: Record<string, QueryValue> = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === "") continue;
    params.set(key, String(value));
  }
  const search = params.toString();
  if (!search) return path;
  return `${path}${path.includes("?") ? "&" : "?"}${search}`;
}

export type ApiOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Sent as JSON, or as multipart when it is a FormData (file uploads). */
  body?: unknown;
  /** The access token of the signed-in person. */
  token?: string | null;
  /** The working campus, sent as X-School-Id. */
  schoolId?: string | null;
};

const FALLBACK_MESSAGES: Record<number, string> = {
  401: "Your session has ended. Please log in again.",
  403: "You cannot do that.",
  404: "That was not found.",
  429: "Too many attempts. Please wait a minute and try again.",
};

/** Calls the backend API (`path` starts with /v1/... or /health). */
export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  // The browser sets the multipart Content-Type (with its boundary) itself.
  const multipart = options.body instanceof FormData;
  if (options.body !== undefined && !multipart) headers["Content-Type"] = "application/json";
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.schoolId) headers["X-School-Id"] = options.schoolId;

  let body: BodyInit | undefined;
  if (multipart) body = options.body as FormData;
  else if (options.body !== undefined) body = JSON.stringify(options.body);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? "GET",
      headers,
      body,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "The server cannot be reached. Check your connection and try again.", "network_error");
  }

  if (response.status === 204) return undefined as T;
  const data = (await response.json().catch(() => null)) as
    | { error?: { code?: string; message?: string; fields?: Record<string, string[]> } }
    | null;
  if (!response.ok) {
    const error = data?.error;
    throw new ApiError(
      response.status,
      error?.message ?? FALLBACK_MESSAGES[response.status] ?? "Something went wrong. Please try again.",
      error?.code ?? null,
      error?.fields ?? {},
    );
  }
  return data as T;
}
