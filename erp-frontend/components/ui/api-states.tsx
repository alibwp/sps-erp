"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import type { ApiError } from "@/lib/api";
import type { ApiQuery } from "@/lib/use-api";
import { cn } from "@/lib/utils";

// Building blocks shared by every screen that reads from and writes to the
// backend: a settings section, the loading/failure state of a query, and the
// message of a failed change that no form field shows.

/** Two-column section: title and description on the left, content on the right. */
export function FormSection({
  id,
  title,
  description,
  action,
  children,
}: {
  id?: string;
  title: string;
  description: string;
  /** Shown under the description, e.g. a status badge. */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={id ? `${id}-title` : undefined}
      className="grid scroll-mt-24 gap-6 border-b pb-10 last:border-0 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"
    >
      <div>
        <h2 id={id ? `${id}-title` : undefined} className="text-lg font-medium">
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        {action && <div className="mt-3">{action}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/**
 * The backend's message for a failure that no field on the form shows (a
 * field's own message shows under that field instead).
 */
export function FormError({ error, fields = [] }: { error: ApiError | null; fields?: readonly string[] }) {
  if (!error) return null;
  const shown = Object.keys(error.fields).some((name) => fields.includes(name));
  if (shown) return null;
  return <Alert tone="destructive">{error.message}</Alert>;
}

/**
 * Failures of the lists a screen picks from or labels with (years, classes,
 * sections, subjects). Without it a failed list would only leave a select
 * empty. Shows nothing while every list is fine or still loading.
 */
export function LookupError({ queries, className }: { queries: ReadonlyArray<ApiQuery<unknown>>; className?: string }) {
  const failed = queries.filter((query) => query.error);
  if (failed.length === 0) return null;
  return (
    <div className={cn("grid justify-items-start gap-2", className)}>
      <Alert tone="destructive" title="Some lists could not be loaded">
        {failed[0].error?.message}
      </Alert>
      <Button variant="outline" size="sm" onClick={() => failed.forEach((query) => query.reload())}>
        Try again
      </Button>
    </div>
  );
}

/** Loading and failure for content that reads from the backend first. */
export function Loaded<T>({
  query,
  children,
  className,
}: {
  query: ApiQuery<T>;
  children: (data: T) => ReactNode;
  className?: string;
}) {
  if (query.data !== undefined) return <>{children(query.data)}</>;
  if (query.error) {
    return (
      <div className={cn("grid justify-items-start gap-3", className)}>
        <Alert tone="destructive">{query.error.message}</Alert>
        <Button variant="outline" size="sm" onClick={query.reload}>
          Try again
        </Button>
      </div>
    );
  }
  return (
    <p className={cn("text-sm text-muted-foreground", className)} aria-busy="true">
      Loading…
    </p>
  );
}
