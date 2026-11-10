"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { API_URL } from "@/lib/api";
import { cn } from "@/lib/utils";

type Health = {
  server: "up";
  database: "up" | "down";
  uptimeSeconds: number;
};

type Status =
  | { kind: "checking" }
  | { kind: "online"; health: Health; checkedAt: Date }
  | { kind: "offline"; checkedAt: Date };

type Tone = "ok" | "bad" | "idle";

const REFRESH_MS = 10_000;

/** Live health of the backend API and its database. */
export function BackendStatus() {
  const [status, setStatus] = useState<Status>({ kind: "checking" });

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch(`${API_URL}/health`, { cache: "no-store" });
        // A 503 still carries the health body: server up, database down.
        if (!res.ok && res.status !== 503) throw new Error(`HTTP ${res.status}`);
        const health = (await res.json()) as Health;
        if (!cancelled) setStatus({ kind: "online", health, checkedAt: new Date() });
      } catch {
        if (!cancelled) setStatus({ kind: "offline", checkedAt: new Date() });
      }
    }

    check();
    const interval = setInterval(check, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const server: { tone: Tone; label: string } =
    status.kind === "checking"
      ? { tone: "idle", label: "Checking…" }
      : status.kind === "online"
        ? { tone: "ok", label: "Online" }
        : { tone: "bad", label: "Offline" };

  const database: { tone: Tone; label: string } =
    status.kind === "online"
      ? status.health.database === "up"
        ? { tone: "ok", label: "Connected" }
        : { tone: "bad", label: "Disconnected" }
      : { tone: "idle", label: status.kind === "checking" ? "Checking…" : "Unknown" };

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-baseline justify-between gap-2 border-b">
        <CardTitle className="text-base">System status</CardTitle>
        {status.kind !== "checking" && (
          <span className="text-xs text-muted-foreground">
            Last checked {status.checkedAt.toLocaleTimeString()} · refreshes every {REFRESH_MS / 1000}s
          </span>
        )}
      </CardHeader>
      <CardContent className="pt-2">
        <dl className="divide-y">
          <StatusRow name="Backend API" {...server} />
          <StatusRow name="Database" {...database} />
          <div className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
            <dt className="text-muted-foreground">API URL</dt>
            <dd className="break-all font-mono text-xs">{API_URL}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

const toneClasses: Record<Tone, string> = {
  ok: "bg-success",
  bad: "bg-destructive",
  idle: "bg-muted-foreground/50",
};

function StatusRow({ name, tone, label }: { name: string; tone: Tone; label: string }) {
  return (
    <div className="flex items-center justify-between py-3 text-sm">
      <dt className="text-muted-foreground">{name}</dt>
      <dd className="flex items-center gap-2 font-medium">
        <span className={cn("size-2 rounded-full", toneClasses[tone])} aria-hidden />
        {label}
      </dd>
    </div>
  );
}
