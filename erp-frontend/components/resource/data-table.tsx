"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, ArrowUpRight, Ellipsis, Eye, Pencil, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Cell, cellText } from "@/components/resource/cell";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuItem, DropdownMenuLink, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Input, Select } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { getResource, rowTitle, type Column, type Row } from "@/lib/resources";
import { cn } from "@/lib/utils";

const PER_PAGE_OPTIONS = [10, 25, 50];

type Props = {
  slug: string;
  /** Show only rows where `filter.key` equals `filter.value`. */
  filter?: { key: string; value: string };
  /** A smaller table for record pages: no search, five rows a page. */
  compact?: boolean;
};

/** The searchable, sortable, paginated table every list screen uses. */
export function ResourceTable({ slug, filter, compact = false }: Props) {
  const resource = getResource(slug);
  const toast = useToast();
  const [deleted, setDeleted] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const [perPage, setPerPage] = useState(compact ? 5 : 10);
  const [page, setPage] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<Row | null>(null);

  const columns = useMemo(() => (resource?.columns ?? []).filter((column) => !column.detailOnly), [resource]);

  const visibleRows = useMemo(() => {
    if (!resource) return [];
    let result = resource.rows.filter((row) => !deleted.has(row.id));
    if (filter) result = result.filter((row) => String(row[filter.key]) === filter.value);
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
  }, [resource, deleted, filter, query, sort]);

  if (!resource) return null;

  const pageCount = Math.max(1, Math.ceil(visibleRows.length / perPage));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * perPage;
  const pageRows = visibleRows.slice(start, start + perPage);
  const editable = Boolean(resource.form);

  const toggleSort = (column: Column) => {
    setSort((current) =>
      current?.key !== column.key
        ? { key: column.key, direction: "asc" }
        : current.direction === "asc"
          ? { key: column.key, direction: "desc" }
          : null,
    );
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
          <p className="text-sm text-muted-foreground">
            {visibleRows.length} {visibleRows.length === 1 ? "record" : "records"}
          </p>
        </div>
      )}

      <div className="relative max-w-full overflow-x-auto rounded-lg border beautify-scrollbar">
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
                    <button
                      type="button"
                      onClick={() => toggleSort(column)}
                      className="-ml-2 inline-flex h-8 items-center gap-1.5 rounded-md px-2 hover:bg-accent hover:text-accent-foreground"
                    >
                      {column.label}
                      <SortIcon className={cn("size-3.5", !active && "opacity-40")} aria-hidden />
                    </button>
                  </th>
                );
              })}
              <th scope="col" data-actions className="h-11 px-4 text-right font-medium text-muted-foreground">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
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
                        <DropdownMenuSeparator />
                        <DropdownMenuItem destructive onClick={() => setPendingDelete(row)}>
                          <Trash2 /> Delete
                        </DropdownMenuItem>
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
        {pageRows.length === 0 && (
          <EmptyState
            title={query ? "Nothing matches your search" : `No ${resource.title.toLowerCase()} yet`}
            description={query ? "Try a different name or clear the search." : resource.description}
          />
        )}
      </div>

      {visibleRows.length > perPage || !compact ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {visibleRows.length === 0
              ? "No results"
              : `Showing ${start + 1} to ${Math.min(start + perPage, visibleRows.length)} of ${visibleRows.length} results`}
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
        description="This removes the record from the list. It cannot be undone."
        onConfirm={() => {
          if (!pendingDelete) return;
          const title = rowTitle(resource, pendingDelete);
          setDeleted((current) => new Set(current).add(pendingDelete.id));
          toast({ title: `${title} deleted`, description: "Demo data only — the backend is not connected yet." });
        }}
      />
    </div>
  );
}
