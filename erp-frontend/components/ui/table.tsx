"use client";

import { Search } from "lucide-react";
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { cn } from "@/lib/utils";

// Table pieces for hand-built lists, styled like the resource data table so
// every list in the app looks the same.

export function Table({ busy, className, children }: { busy?: boolean; className?: string; children: ReactNode }) {
  return (
    <div className={cn("relative max-w-full overflow-x-auto rounded-lg border beautify-scrollbar", className)} aria-busy={busy}>
      <table className={cn("w-full caption-bottom text-sm transition-opacity", busy && "opacity-60")}>{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="bg-muted/50">
      <tr className="border-b">{children}</tr>
    </thead>
  );
}

export function TH({ className, children, ...props }: ComponentProps<"th">) {
  return (
    <th
      scope="col"
      className={cn("h-11 whitespace-nowrap px-4 text-left align-middle font-medium text-muted-foreground", className)}
      {...props}
    >
      {children}
    </th>
  );
}

export function TR({ className, ...props }: ComponentProps<"tr">) {
  return <tr className={cn("border-b transition-colors last:border-0 hover:bg-muted/40", className)} {...props} />;
}

export function TD({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("px-4 py-3 align-middle", className)} {...props} />;
}

/** A search box that reports its text after the person stops typing. */
export function SearchBox({
  label,
  onSearch,
  delay = 300,
  className,
}: {
  label: string;
  onSearch: (text: string) => void;
  delay?: number;
  className?: string;
}) {
  const [text, setText] = useState("");
  // The latest callback, so only typing (not a new callback each render) triggers a search.
  const callback = useRef(onSearch);
  useEffect(() => {
    callback.current = onSearch;
  }, [onSearch]);
  const first = useRef(true);
  useEffect(() => {
    // Nothing typed yet: no search to report.
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = window.setTimeout(() => callback.current(text.trim()), delay);
    return () => window.clearTimeout(timer);
  }, [text, delay]);

  return (
    <div className={cn("relative w-full max-w-sm", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input
        type="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={label}
        aria-label={label}
        className="pl-9"
      />
    </div>
  );
}

/** "Showing 1 to 10 of 42" with previous/next buttons. */
export function Pagination({
  page,
  perPage,
  total,
  onPage,
}: {
  page: number;
  perPage: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  if (total <= perPage) return null;
  const start = (page - 1) * perPage;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        Showing {start + 1} to {Math.min(start + perPage, total)} of {total} results
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <span className="min-w-20 text-center text-sm tabular-nums text-muted-foreground">
          {page} / {pageCount}
        </span>
        <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}
