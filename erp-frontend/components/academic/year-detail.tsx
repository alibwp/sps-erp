"use client";

import { useRouter } from "next/navigation";
import { CalendarClock, Check, Circle, Ellipsis, History, Pencil, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { refreshContext, useWorkingContext } from "@/components/auth/session";
import { DatesDialog, HistoryPanel, StatusBadge, StatusDialog, useStatusMoves } from "@/components/academic/status-dialogs";
import { RollForwardPanel, useCanRollForward } from "@/components/academic/roll-forward";
import { TeachingModelPanel } from "@/components/academic/teaching-model";
import { TermsPanel } from "@/components/academic/terms";
import { Page } from "@/components/layout/page-header";
import { Loaded } from "@/components/ui/api-states";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { academicApi, ACADEMIC_STATUS_LABELS, isFrozen, type YearDetail, type YearSetup } from "@/lib/academic";
import { useApiMutation, useApiQuery } from "@/lib/use-api";
import { cn, formatDate } from "@/lib/utils";

type Dialog = "dates" | "status" | "publish" | "delete" | null;

/** /academic-years/[id]: the year, its terms, teaching model, setup and history. */
export function YearDetailScreen({ id }: { id: string }) {
  const year = useApiQuery<YearDetail>(academicApi.year(id), { keepPrevious: true });
  const name = year.data?.name ?? "School year";

  return (
    <Page
      title={
        <span className="flex flex-wrap items-center gap-3">
          {name}
          {year.data && <StatusBadge status={year.data.status} />}
        </span>
      }
      breadcrumbs={[{ label: "School years", href: "/academic-years" }, { label: name }]}
      actions={year.data && <YearActions year={year.data} onChanged={year.reload} />}
    >
      <Loaded query={year}>{(data) => <YearBody year={data} onChanged={year.reload} />}</Loaded>
    </Page>
  );
}

function YearActions({ year, onChanged }: { year: YearDetail; onChanged: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { can } = useWorkingContext();
  const action = useApiMutation();
  const [dialog, setDialog] = useState<Dialog>(null);
  const moves = useStatusMoves("year", year.status);

  const draft = year.status === "draft";
  const canUpdate = can("update academic year");
  const canDates = canUpdate && !draft && !isFrozen(year.status);
  const canDelete = draft && can("delete academic year");
  const target = { kind: "year" as const, path: academicApi.year(year.id), name: year.name, status: year.status };

  // The working year and term may follow a publish or a status change.
  const changed = () => {
    onChanged();
    void refreshContext().catch(() => undefined);
  };

  async function publish() {
    const sent = await action.send<YearDetail>(`${academicApi.year(year.id)}/publish`, { method: "POST" });
    if (!sent.ok) {
      toast({ title: "Could not publish", description: sent.error.message, tone: "error" });
      return;
    }
    changed();
    toast({ title: `${year.name} published`, description: `It is now ${ACADEMIC_STATUS_LABELS[sent.data.status].toLowerCase()}.` });
  }

  async function remove() {
    const sent = await action.send(academicApi.year(year.id), { method: "DELETE" });
    if (!sent.ok) {
      toast({ title: "Could not delete", description: sent.error.message, tone: "error" });
      return;
    }
    toast({ title: `${year.name} deleted` });
    router.push("/academic-years");
  }

  const hasMenu = canDates || moves.length > 0 || canDelete;

  return (
    <>
      {draft && canUpdate && (
        <>
          <ButtonLink href={`/academic-years/${year.id}/edit`} variant="outline">
            <Pencil /> Edit calendar
          </ButtonLink>
          <Button onClick={() => setDialog("publish")} disabled={action.submitting}>
            <Send /> Publish
          </Button>
        </>
      )}
      {hasMenu && (
        <DropdownMenu trigger={<Ellipsis className="size-4" />} triggerLabel="More actions" triggerVariant="outline" triggerClassName="size-10" className="w-52">
          {canDates && (
            <DropdownMenuItem onClick={() => setDialog("dates")}>
              <CalendarClock /> Change dates
            </DropdownMenuItem>
          )}
          {moves.length > 0 && (
            <DropdownMenuItem onClick={() => setDialog("status")}>
              <History /> Change status
            </DropdownMenuItem>
          )}
          {canDelete && (
            <DropdownMenuItem destructive onClick={() => setDialog("delete")}>
              <Trash2 /> Delete draft
            </DropdownMenuItem>
          )}
        </DropdownMenu>
      )}

      {dialog === "dates" && (
        <DatesDialog target={target} startsOn={year.startsOn} endsOn={year.endsOn} onClose={() => setDialog(null)} onDone={changed} />
      )}
      {dialog === "status" && <StatusDialog target={target} onClose={() => setDialog(null)} onDone={changed} />}
      <ConfirmDialog
        open={dialog === "publish"}
        onClose={() => setDialog(null)}
        onConfirm={() => void publish()}
        title={`Publish ${year.name}?`}
        description="The year and each term become scheduled, open or closed from their dates, and the campus opens in this year by default. The calendar can no longer be rewritten whole."
        confirmLabel="Publish"
        destructive={false}
      />
      <ConfirmDialog
        open={dialog === "delete"}
        onClose={() => setDialog(null)}
        onConfirm={() => void remove()}
        title={`Delete ${year.name}?`}
        description="The draft and its terms are deleted. This cannot be undone."
        confirmLabel="Delete"
      />
    </>
  );
}

function YearBody({ year, onChanged }: { year: YearDetail; onChanged: () => void }) {
  const { can } = useWorkingContext();
  const canRollForward = useCanRollForward(year);
  const tabs = [
    { label: "Terms", content: <TermsPanel year={year} onChanged={onChanged} /> },
    { label: "Teaching model", content: <TeachingModelPanel year={year} /> },
    (can("update school") || can("manage school settings")) && { label: "Setup", content: <YearSetupPanel year={year} /> },
    canRollForward && { label: "Roll forward", content: <RollForwardPanel year={year} onChanged={onChanged} /> },
    // Re-mounted (and re-read) whenever the status changes.
    { label: "History", content: <HistoryPanel key={year.status} path={academicApi.year(year.id)} /> },
  ].filter((tab) => tab !== false);

  return (
    <div className="grid gap-8">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <Fact label="First day" value={formatDate(year.startsOn)} />
        <Fact label="Last day" value={formatDate(year.endsOn)} />
        <Fact label="Terms" value={String(year.periods.length)} />
        <Fact label="Campus default" value={year.isCampusDefault ? "Yes" : "No"} />
      </dl>
      <Tabs tabs={tabs} />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}

/** GET /v1/academic-years/:id/setup: what this year still needs. */
function YearSetupPanel({ year }: { year: YearDetail }) {
  const setup = useApiQuery<YearSetup>(`${academicApi.year(year.id)}/setup`, { keepPrevious: true });
  return (
    <Loaded query={setup}>
      {(data) => (
        <ol className="grid max-w-2xl">
          {data.steps.map((step) => (
            <li key={step.value} className="flex items-start gap-3 border-b py-3 last:border-0">
              <span
                className={cn(
                  "mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border",
                  step.complete ? "border-success bg-success/10 text-success" : "text-muted-foreground",
                )}
                aria-hidden
              >
                {step.complete ? <Check className="size-3.5" /> : <Circle className="size-2.5" />}
              </span>
              <span className="grid flex-1 gap-0.5">
                <span className={cn("text-sm", !step.complete && "font-medium")}>
                  {step.label}
                  <span className="sr-only">{step.complete ? " (done)" : " (not done)"}</span>
                </span>
                <span className="text-xs text-muted-foreground">{step.description}</span>
              </span>
              {!step.complete && step.value === data.current && <Badge tone="solid">Next</Badge>}
              {!step.complete && step.required && step.value !== data.current && (
                <span className="text-xs font-medium text-warning">Required</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </Loaded>
  );
}
