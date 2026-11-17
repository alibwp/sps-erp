"use client";

import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ArrowUpRight,
  CircleAlert,
  Ellipsis,
  Eye,
  LoaderCircle,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Cell, cellText } from "@/components/resource/cell";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuItem, DropdownMenuLink, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Input, Select } from "@/components/ui/form";
import { Alert, EmptyState } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useAccess, useSession } from "@/components/auth/session";
import { withQuery, type Paginated } from "@/lib/api";
import { canChange } from "@/lib/nav";
import { getResource, itemPath, rowTitle, type Column, type Resource, type Row } from "@/lib/resources";
import { useApiMutation, useApiQuery } from "@/lib/use-api";
import { cn } from "@/lib/utils";

const PER_PAGE_OPTIONS = [10, 25, 50];
const SEARCH_DELAY_MS = 300;

type Sort = { key: string; direction: "asc" | "desc" };

type Props = {
  slug: string;
  /** Demo lists: show only rows where `filter.key` equals `filter.value`. */
  filter?: { key: string; value: string };
  /** Live lists: extra query parameters, e.g. { levelId: "…" }. */
  params?: Record<string, string>;
  /** A smaller table for record pages: no search, five rows a page. */
  compact?: boolean;
};

/** The searchable, sortable, paginated table every list screen uses. */
export function ResourceTable({ slug, filter, params, compact = false }: Props) {
  const resource = getResource(slug);
  if (!resource) return null;
  return <Table resource={resource} filter={filter} params={params} compact={compact} />;
}

function Table({ resource, filter, params, compact = false }: Omit<Props, "slug"> & { resource: Resource }) {
  const toast = useToast();
  const [deleted, setDeleted] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort | null>(null);
  const [perPage, setPerPage] = useState(compact ? 5 : 10);
  const [page, setPage] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<Row | null>(null);
  const { role } = useSession();
  const access = useAccess();
  const removal = useApiMutation();

  const api = resource.api;
  const serverPaged = api?.paged === true;
  const search = useDebounced(query.trim(), SEARCH_DELAY_MS);

  // ----- Where the rows come from --------------------------------------------
  // Demo screens: resource.rows. Live screens: the backend, which does the
  // searching, sorting and paging itself when its list is paged.
  let listPath: string | null = null;
  if (api) {
    const sortField = sort && api.sort?.[sort.key];
    listPath = withQuery(api.path, {
      ...api.query,
      ...params,
      ...(serverPaged
        ? {
            page,
            perPage,
            search,
            sort: sortField ? `${sort.direction === "desc" ? "-" : ""}${sortField}` : undefined,
          }
        : {}),
    });
  }
  const live = useApiQuery<Paginated<unknown> | unknown[]>(listPath, { keepPrevious: true });

  const sourceRows = useMemo<Row[]>(() => {
    if (!api) return resource.rows;
    const records = Array.isArray(live.data) ? live.data : (live.data?.data ?? []);
    return records.map((record) => api.toRow(record as never));
  }, [api, resource.rows, live.data]);

  // Searching, sorting and filtering done here (demo and unpaged live lists).
  const localRows = useMemo(() => {
    if (serverPaged) return sourceRows;
    let result = sourceRows.filter((row) => !deleted.has(row.id));
    if (filter && !api) result = result.filter((row) => String(row[filter.key]) === filter.value);
    const needle = query.trim().toLowerCase();
    if (needle) {
      result = result.filter((row) =>
        resource.columns.some((column) => cellText(column, row).toLowerCase().includes(needle)),
      );
    }
    if (sort) {
      const direction = sort.direction === "asc" ? 1 : -1;
      result = [...result].sort((a, b) => {
        const left = a[sort.key];
        const right = b[sort.key];
        if (typeof left === "number" && typeof right === "number") return (left - right) * direction;
        return String(left ?? "").localeCompare(String(right ?? ""), undefined, { numeric: true }) * direction;
      });
    }
    return result;
  }, [serverPaged, sourceRows, deleted, filter, api, query, sort, resource.columns]);

  const columns = resource.columns.filter((column) => !column.detailOnly);

  const total = serverPaged && !Array.isArray(live.data) ? (live.data?.meta.total ?? 0) : localRows.length;
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * perPage;
  const pageRows = serverPaged ? localRows : localRows.slice(start, start + perPage);
  const editable = Boolean(resource.form) && canChange(role.id, `/${resource.slug}`, access);
  const deletable = !api || api.remove === true;
  const firstLoad = live.loading && live.data === undefined;

  const sortable = (column: Column) => !serverPaged || Boolean(api?.sort?.[column.key]);

  const toggleSort = (column: Column) => {
    setSort((current) =>
      current?.key !== column.key
        ? { key: column.key, direction: "asc" }
        : current.direction === "asc"
          ? { key: column.key, direction: "desc" }
          : null,
    );
    setPage(1);
  };

  const confirmDelete = async (row: Row) => {
    const title = rowTitle(resource, row);
    if (!api) {
      setDeleted((current) => new Set(current).add(row.id));
      toast({ title: `${title} deleted`, description: "Demo data only — the backend is not connected yet." });
      return;
    }
    const result = await removal.send(itemPath(api, row.id), { method: "DELETE" });
    if (result.ok) {
      toast({ title: `${title} deleted` });
      live.reload();
    } else {
      toast({ title: `${title} was not deleted`, description: result.error.message, tone: "error" });
    }
  };

  return (
    <div className="space-y-4" data-slot="data-table">
      {!compact && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder={`Search ${resource.title.toLowerCase()}...`}
              aria-label={`Search ${resource.title.toLowerCase()}`}
              className="h-10 pl-9"
            />
          </div>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            {live.loading && !firstLoad && <LoaderCircle className="size-4 animate-spin" aria-label="Loading" />}
            {firstLoad ? "Loading..." : `${total} ${total === 1 ? "record" : "records"}`}
          </p>
        </div>
      )}

      {live.error && (
        <Alert tone="destructive" icon={CircleAlert} title={`${resource.title} could not be loaded`}>
          <span className="flex flex-wrap items-center gap-3">
            {live.error.message}
            <Button variant="outline" size="sm" onClick={live.reload}>
              Try again
            </Button>
          </span>
        </Alert>
      )}

      <div className="relative max-w-full overflow-x-auto rounded-lg border beautify-scrollbar" aria-busy={live.loading}>
        <table className="w-full caption-bottom text-sm">
          <thead className="bg-muted/50">
            <tr className="border-b">
              {columns.map((column) => {
                const active = sort?.key === column.key;
                const SortIcon = !active ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}
                    className="h-11 whitespace-nowrap px-4 text-left align-middle font-medium text-muted-foreground"
                  >
                    {sortable(column) ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column)}
                        className="-ml-2 inline-flex h-8 items-center gap-1.5 rounded-md px-2 hover:bg-accent hover:text-accent-foreground"
                      >
                        {column.label}
                        <SortIcon className={cn("size-3.5", !active && "opacity-40")} aria-hidden />
                      </button>
                    ) : (
                      column.label
                    )}
                  </th>
                );
              })}
              <th scope="col" data-actions className="h-11 px-4 text-right font-medium text-muted-foreground">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className={cn(live.loading && !firstLoad && "opacity-60")}>
            {pageRows.map((row) => {
              const title = rowTitle(resource, row);
              const href = `/${resource.slug}/${row.id}`;
              return (
                <tr key={row.id} className="border-b transition-colors last:border-0 hover:bg-muted/40">
                  {columns.map((column, index) => (
                    <td key={column.key} className="max-w-72 px-4 py-3 align-middle">
                      {index === 0 ? (
                        <Link href={href} className="block min-w-0 hover:underline hover:underline-offset-4">
                          <Cell column={column} row={row} />
                        </Link>
                      ) : (
                        <Cell column={column} row={row} />
                      )}
                    </td>
                  ))}
                  <td data-actions className="px-4 py-2 text-right align-middle">
                    {editable ? (
                      <DropdownMenu
                        trigger={<Ellipsis className="size-4" />}
                        triggerLabel={`Actions for ${title}`}
                        triggerVariant="outline"
                        triggerClassName="size-10"
                        className="w-52"
                      >
                        <DropdownMenuLink href={href}>
                          <Eye /> View {resource.singular.toLowerCase()}
                        </DropdownMenuLink>
                        <DropdownMenuLink href={`${href}/edit`}>
                          <Pencil /> Edit {resource.singular.toLowerCase()}
                        </DropdownMenuLink>
                        {deletable && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem destructive onClick={() => setPendingDelete(row)}>
                              <Trash2 /> Delete
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenu>
                    ) : (
                      <Link
                        href={href}
                        aria-label={`Open ${title}`}
                        className="inline-flex size-10 items-center justify-center rounded-md border border-input bg-background shadow-sm hover:bg-accent"
                      >
                        <ArrowUpRight className="size-4" />
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {firstLoad && (
          <div className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" aria-hidden /> Loading {resource.title.toLowerCase()}...
          </div>
        )}
        {!firstLoad && !live.error && pageRows.length === 0 && (
          <EmptyState
            title={query ? "Nothing matches your search" : `No ${resource.title.toLowerCase()} yet`}
            description={query ? "Try a different name or clear the search." : resource.description}
          />
        )}
      </div>

      {total > perPage || !compact ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {total === 0
              ? "No results"
              : `Showing ${start + 1} to ${Math.min(start + perPage, total)} of ${total} results`}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {!compact && (
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                Per page
                <Select
                  value={perPage}
                  onChange={(event) => {
                    setPerPage(Number(event.target.value));
                    setPage(1);
                  }}
                  className="h-9 w-20"
                >
                  {PER_PAGE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
              </label>
            )}
            <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
              Previous
            </Button>
            <span className="min-w-20 text-center text-sm tabular-nums text-muted-foreground">
              Page {currentPage} of {pageCount}
            </span>
            <Button variant="outline" size="sm" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>
              Next
            </Button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title={pendingDelete ? `Delete ${rowTitle(resource, pendingDelete)}?` : "Delete?"}
        description={api ? "This deletes the record. It cannot be undone." : "This removes the record from the list. It cannot be undone."}
        onConfirm={() => {
          if (pendingDelete) void confirmDelete(pendingDelete);
        }}
      />
    </div>
  );
}

/** `value`, updated only after it has stopped changing for `delay` ms. */
function useDebounced<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return settled;
}
