"use client";

import { Trash2, Wallet } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { FormError, Loaded } from "@/components/ui/api-states";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/misc";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import type { Paginated } from "@/lib/api";
import { orgApi, type BillingGroup, type OrganizationDto, type OrgCampus } from "@/lib/organizations";
import { useApiMutation, useApiQuery } from "@/lib/use-api";
import { formatDate } from "@/lib/utils";

/**
 * Billing groups of an organization ("manage organization"). A group starts
 * empty; campuses join it from the Campuses tab. Only an empty group can be
 * deleted.
 */
export function BillingGroupsPanel({ organization }: { organization: OrganizationDto }) {
  const toast = useToast();
  const groups = useApiQuery<BillingGroup[]>(orgApi.billingGroups(organization.id), { keepPrevious: true });
  // Names of the campuses in each group.
  const campuses = useApiQuery<Paginated<OrgCampus>>(`${orgApi.campuses(organization.id)}?perPage=100`, { keepPrevious: true });
  const campusName = useMemo(() => new Map((campuses.data?.data ?? []).map((campus) => [campus.id, campus.name])), [campuses.data]);

  const create = useApiMutation();
  const removal = useApiMutation();
  const [name, setName] = useState("");
  const [deleting, setDeleting] = useState<BillingGroup | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sent = await create.send<BillingGroup>(orgApi.billingGroups(organization.id), {
      method: "POST",
      body: { name: name.trim() },
    });
    if (!sent.ok) return;
    setName("");
    groups.reload();
    toast({ title: "Billing group created", description: sent.data.name });
  }

  async function remove(group: BillingGroup) {
    const sent = await removal.send(orgApi.billingGroup(organization.id, group.id), { method: "DELETE" });
    if (!sent.ok) {
      toast({ title: "Could not delete the billing group", description: sent.error.message, tone: "error" });
      return;
    }
    groups.reload();
    toast({ title: "Billing group deleted", description: group.name });
  }

  return (
    <div className="grid gap-6">
      <form onSubmit={submit} className="grid max-w-xl gap-2">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="New billing group" htmlFor="billing-group-name" error={create.fieldErrors.name} className="min-w-60 flex-1">
            <Input
              id="billing-group-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                create.clear();
              }}
              required
              maxLength={100}
              placeholder="e.g. Rawalpindi campuses"
              disabled={create.submitting}
            />
          </Field>
          <Button type="submit" disabled={create.submitting || name.trim() === ""}>
            {create.submitting ? "Creating…" : "Create"}
          </Button>
        </div>
        <FormError error={create.error} fields={["name"]} />
      </form>

      <Loaded query={groups}>
        {(data) =>
          data.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No billing groups"
              description="Every campus bills on its own. Create a group to let several campuses share their invoicing."
            />
          ) : (
            <Table busy={groups.loading}>
              <THead>
                <TH>Group</TH>
                <TH>Campuses</TH>
                <TH>Created</TH>
                <TH className="text-right">
                  <span className="sr-only">Actions</span>
                </TH>
              </THead>
              <tbody>
                {data.map((group) => {
                  const inUse = group.schoolIds.length > 0;
                  return (
                    <TR key={group.id}>
                      <TD className="font-medium">{group.name}</TD>
                      <TD>
                        {inUse
                          ? group.schoolIds.map((id) => campusName.get(id) ?? "Campus").join(", ")
                          : <span className="text-muted-foreground">No campuses yet</span>}
                      </TD>
                      <TD className="whitespace-nowrap">{formatDate(group.createdAt)}</TD>
                      <TD className="py-2 text-right">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Delete ${group.name}`}
                          title={inUse ? "Move its campuses out first" : `Delete ${group.name}`}
                          disabled={inUse || removal.submitting}
                          onClick={() => setDeleting(group)}
                        >
                          <Trash2 />
                        </Button>
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          )
        }
      </Loaded>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) void remove(deleting);
        }}
        title={`Delete ${deleting?.name ?? "this billing group"}?`}
        description="The group has no campuses, so nothing else changes."
        confirmLabel="Delete"
      />
    </div>
  );
}
