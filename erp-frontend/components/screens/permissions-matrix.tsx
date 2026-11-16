"use client";

import { Lock, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/form";
import { groupPermissions } from "@/lib/people";
import { cn } from "@/lib/utils";

/**
 * What a role holds, grouped by area ("Student": read, create, update, delete).
 *
 * `grantable` is what the signed-in person may put in a role here
 * (GET /v1/roles/grantable-permissions). The backend refuses a role that
 * would hold anything outside it, and refuses taking out anything outside it,
 * so permissions the role holds beyond it are shown locked. Read-only when
 * `onChange` is left out.
 */
export function PermissionsMatrix({
  value,
  onChange,
  grantable,
}: {
  value: ReadonlySet<string>;
  onChange?: (next: Set<string>) => void;
  grantable?: ReadonlySet<string>;
}) {
  const [filter, setFilter] = useState("");
  const editable = Boolean(onChange);
  // Everything that can appear: what may be granted, plus what the role holds already.
  const groups = useMemo(() => groupPermissions([...(grantable ?? []), ...value]), [grantable, value]);
  const needle = filter.trim().toLowerCase();
  const shown = needle
    ? groups
        .map((group) => ({
          ...group,
          permissions: group.label.toLowerCase().includes(needle)
            ? group.permissions
            : group.permissions.filter((permission) => permission.name.includes(needle)),
        }))
        .filter((group) => group.permissions.length > 0)
    : groups;

  const canToggle = (name: string) => editable && (!grantable || grantable.has(name));
  const set = (names: string[], on: boolean) => {
    if (!onChange) return;
    const next = new Set(value);
    for (const name of names) {
      if (!canToggle(name)) continue;
      if (on) next.add(name);
      else next.delete(name);
    }
    onChange(next);
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Find a permission"
            aria-label="Find a permission"
            className="pl-9"
          />
        </div>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{value.size}</span> granted
        </p>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">{needle ? "No permission matches." : "No permissions."}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {shown.map((group) => {
            const names = group.permissions.map((permission) => permission.name);
            const held = names.filter((name) => value.has(name)).length;
            const toggleable = names.filter(canToggle);
            const allOn = toggleable.length > 0 && toggleable.every((name) => value.has(name));
            return (
              <fieldset key={group.key} className="grid content-start gap-2 rounded-lg border p-3">
                <legend className="sr-only">{group.label}</legend>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{group.label}</span>
                  <span className="flex items-center gap-2">
                    <Badge tone={held > 0 ? "success" : "neutral"}>
                      {held}/{names.length}
                    </Badge>
                    {editable && toggleable.length > 1 && (
                      <button
                        type="button"
                        className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                        onClick={() => set(toggleable, !allOn)}
                      >
                        {allOn ? "None" : "All"}
                      </button>
                    )}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {group.permissions.map((permission) => {
                    const on = value.has(permission.name);
                    const locked = editable && !canToggle(permission.name);
                    return (
                      <label
                        key={permission.name}
                        title={locked ? "You do not hold this permission, so you cannot change it." : permission.name}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
                          on ? "border-primary/40 bg-primary/10 text-foreground" : "text-muted-foreground",
                          editable && !locked && "cursor-pointer hover:bg-muted/60",
                          locked && "opacity-70",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="size-3.5"
                          checked={on}
                          disabled={!editable || locked}
                          onChange={(event) => set([permission.name], event.target.checked)}
                        />
                        {permission.label}
                        {locked && <Lock className="size-3" aria-label="Locked" />}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
        </div>
      )}
    </div>
  );
}
