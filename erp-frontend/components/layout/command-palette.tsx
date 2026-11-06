"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, CornerDownLeft, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useSidebar } from "@/components/layout/sidebar-context";
import { Kbd } from "@/components/ui/misc";
import { useSession } from "@/components/auth/session";
import { commandItemsFor, type CommandItem } from "@/lib/nav";
import type { RoleId } from "@/lib/roles";
import { cn } from "@/lib/utils";

/** The pages the signed-in role can open, plus their own profile. */
function itemsFor(role: RoleId): CommandItem[] {
  return [...commandItemsFor(role), { label: "Profile", href: "/profile", group: "Account" }];
}

/** Ctrl/⌘ K search across every page, as in the reference. */
export function CommandPalette() {
  const router = useRouter();
  const { commandOpen: open, setCommandOpen: setOpen } = useSidebar();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <Palette
      onClose={() => setOpen(false)}
      onSelect={(href) => {
        setOpen(false);
        router.push(href);
      }}
    />
  );
}

function Palette({ onClose, onSelect }: { onClose: () => void; onSelect: (href: string) => void }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { role } = useSession();
  const items = useMemo(() => itemsFor(role.id), [role.id]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => `${item.label} ${item.group}`.toLowerCase().includes(needle));
  }, [items, query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key === "Escape") onClose();
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelected((index) => Math.min(index + 1, results.length - 1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelected((index) => Math.max(index - 1, 0));
    }
    if (event.key === "Enter" && results[selected]) {
      event.preventDefault();
      onSelect(results[selected].href);
    }
  };

  return (
    <div
      className="animate-fade-in fixed inset-0 z-[100] flex items-start justify-center bg-black/50 p-4 pt-[12vh] sm:p-6 sm:pt-[15vh]"
      role="presentation"
      onClick={onClose}
      data-print-hide
    >
      <div
        className="animate-pop-in w-full max-w-2xl overflow-hidden rounded-xl border bg-background shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Search pages and features"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 border-b px-4">
          <Search className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected(0);
            }}
            type="search"
            placeholder="Search pages and features..."
            className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
            autoComplete="off"
            spellCheck={false}
            aria-label="Search pages and features"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-results"
            aria-activedescendant={results[selected] ? `command-${selected}` : undefined}
          />
          <Kbd className="px-2 py-1 text-xs">Esc</Kbd>
        </div>

        <div ref={listRef} id="command-results" role="listbox" className="beautify-scrollbar max-h-[60vh] overflow-y-auto overscroll-contain p-2 sm:max-h-[28rem]">
          {results.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">No pages or features found.</p>
          ) : (
            results.map((item, index) => (
              <button
                key={item.href}
                id={`command-${index}`}
                data-index={index}
                type="button"
                role="option"
                aria-selected={selected === index}
                onMouseEnter={() => setSelected(index)}
                onClick={() => onSelect(item.href)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors",
                  selected === index ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                )}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground">
                  <ArrowRight className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{item.group}</span>
                </span>
                <CornerDownLeft className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </button>
            ))
          )}
        </div>

        <div className="hidden items-center justify-between gap-4 border-t px-4 py-2 text-xs text-muted-foreground sm:flex">
          <span>
            Navigate <Kbd>↑</Kbd> <Kbd>↓</Kbd>
          </span>
          <span>
            Open <Kbd>Enter</Kbd>
          </span>
        </div>
      </div>
    </div>
  );
}
