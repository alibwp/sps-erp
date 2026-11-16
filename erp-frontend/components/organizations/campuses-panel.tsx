"use client";

import { CalendarRange, Ellipsis, Pencil, Plus, School, Wallet } from "lucide-react";
import { useCallback, useMemo, useState, type FormEvent } from "react";
import { refreshContext } from "@/components/auth/session";
import { FormError, Loaded } from "@/components/ui/api-states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/misc";
import { Pagination, SearchBox, Table, TD, TH, THead, TR } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { withQuery, type Paginated } from "@/lib/api";
import {
  orgApi,
  orgCan,
  OrgPermission,
  type BillingGroup,
  type CalendarTemplate,
  type OrganizationDto,
  type OrgCampus,
} from "@/lib/organizations";
import { browserTimeZone, timeZoneLabel, timeZones } from "@/lib/time-zones";
import { useApiMutation, useApiQuery } from "@/lib/use-api";

const PER_PAGE = 10;

type Dialogs =
  | { kind: "create" }
  | { kind: "edit"; campus: OrgCampus }
  | { kind: "billing"; campus: OrgCampus }
  | { kind: "template"; campus: OrgCampus }
  | null;

/**
 * An organization's campuses: search, open a campus, edit its details, put it
 * in a billing group, and choose the calendar template it follows. Each action
 * shows only with the organization permission it needs.
 */
export function CampusesPanel({ organization, startCreating = false }: { organization: OrganizationDto; startCreating?: boolean }) {
  const canManageCampuses = orgCan(organization, OrgPermission.ManageCampuses);
  const canManage = orgCan(organization, OrgPermission.Manage);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Dialogs>(startCreating && canManageCampuses ? { kind: "create" } : null);

  const list = useApiQuery<Paginated<OrgCampus>>(
    withQuery(orgApi.campuses(organization.id), { page, perPage: PER_PAGE, search }),
    { keepPrevious: true },
  );
  // Billing groups need "manage organization"; without it the column is left out.
  const groups = useApiQuery<BillingGroup[]>(canManage ? orgApi.billingGroups(organization.id) : null, { keepPrevious: true });
  const templates = useApiQuery<CalendarTemplate[]>(canManage ? orgApi.templates(organization.id) : null, { keepPrevious: true });
  const groupName = useMemo(() => new Map((groups.data ?? []).map((group) => [group.id, group.name])), [groups.data]);

  const onSearch = useCallback((text: string) => {
    setSearch(text);
    setPage(1);
  }, []);

  const changed = () => {
    list.reload();
    groups.reload();
  };
  const hasActions = canManageCampuses || canManage;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchBox label="Search campuses by name or code" onSearch={onSearch} />
        {canManageCampuses && (
          <Button onClick={() => setDialog({ kind: "create" })}>
            <Plus /> Open campus
          </Button>
        )}
      </div>

      <Loaded query={list}>
        {({ data, meta }) =>
          data.length === 0 ? (
            <EmptyState
              icon={School}
              title={search ? "No campus matches" : "No campuses yet"}
              description={search ? "Try another name or code." : "Campuses of this organization appear here."}
            />
          ) : (
            <>
              <Table busy={list.loading}>
                <THead>
                  <TH>Campus</TH>
                  <TH>Location</TH>
                  <TH>Contact</TH>
                  <TH>Time zone</TH>
                  {canManage && <TH>Billing</TH>}
                  {hasActions && (
                    <TH className="text-right">
                      <span className="sr-only">Actions</span>
                    </TH>
                  )}
                </THead>
                <tbody>
                  {data.map((campus) => (
                    <TR key={campus.id}>
                      <TD>
                        <span className="font-medium">{campus.name}</span>
                        <span className="block font-mono text-xs text-muted-foreground">{campus.code}</span>
                      </TD>
                      <TD>{[campus.city, campus.country].filter(Boolean).join(", ") || "—"}</TD>
                      <TD>
                        <span className="block">{campus.email ?? "—"}</span>
                        {campus.phone && <span className="block text-xs text-muted-foreground">{campus.phone}</span>}
                      </TD>
                      <TD className="whitespace-nowrap">{timeZoneLabel(campus.timezone)}</TD>
                      {canManage && (
                        <TD>
                          {campus.billingGroupId ? (
                            <Badge tone="info">{groupName.get(campus.billingGroupId) ?? "Billing group"}</Badge>
                          ) : (
                            <span className="text-muted-foreground">On its own</span>
                          )}
                        </TD>
                      )}
                      {hasActions && (
                        <TD className="py-2 text-right">
                          <DropdownMenu
                            trigger={<Ellipsis className="size-4" />}
                            triggerLabel={`Actions for ${campus.name}`}
                            triggerClassName="size-9"
                            className="w-56"
                          >
                            {canManageCampuses && (
                              <DropdownMenuItem onClick={() => setDialog({ kind: "edit", campus })}>
                                <Pencil /> Edit details
                              </DropdownMenuItem>
                            )}
                            {canManage && (
                              <DropdownMenuItem onClick={() => setDialog({ kind: "billing", campus })}>
                                <Wallet /> Billing group
                              </DropdownMenuItem>
                            )}
                            {canManage && (
                              <DropdownMenuItem onClick={() => setDialog({ kind: "template", campus })}>
                                <CalendarRange /> Calendar template
                              </DropdownMenuItem>
                            )}
                          </DropdownMenu>
                        </TD>
                      )}
                    </TR>
                  ))}
                </tbody>
              </Table>
              <Pagination page={meta.page} perPage={meta.perPage} total={meta.total} onPage={setPage} />
            </>
          )
        }
      </Loaded>

      {(dialog?.kind === "create" || dialog?.kind === "edit") && (
        <CampusDialog
          organization={organization}
          campus={dialog.kind === "edit" ? dialog.campus : undefined}
          onClose={() => setDialog(null)}
          onSaved={changed}
        />
      )}
      {dialog?.kind === "billing" && (
        <BillingGroupDialog
          organization={organization}
          campus={dialog.campus}
          groups={groups.data ?? []}
          onClose={() => setDialog(null)}
          onSaved={changed}
        />
      )}
      {dialog?.kind === "template" && (
        <TemplateDialog
          organization={organization}
          campus={dialog.campus}
          templates={templates.data ?? []}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Open / edit a campus

const CAMPUS_FIELDS = [
  "name",
  "initials",
  "phone",
  "email",
  "address",
  "city",
  "state",
  "postalCode",
  "country",
  "timezone",
] as const;
type CampusField = (typeof CAMPUS_FIELDS)[number];
const CLEARABLE = new Set<CampusField>(["initials", "phone", "email"]);

/**
 * POST …/campuses (every address field and the time zone are required) or
 * PATCH …/campuses/:schoolId (only the fields changed are sent).
 */
function CampusDialog({
  organization,
  campus,
  onClose,
  onSaved,
}: {
  organization: OrganizationDto;
  campus?: OrgCampus;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const save = useApiMutation();
  const editing = campus !== undefined;
  const zones = useMemo(() => timeZones(campus?.timezone ?? browserTimeZone()), [campus?.timezone]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (name: CampusField) => String(form.get(name) ?? "").trim();

    let body: Partial<Record<CampusField, string | null>>;
    if (campus) {
      body = {};
      for (const field of CAMPUS_FIELDS) {
        const next = value(field);
        if (next === (campus[field] ?? "")) continue;
        body[field] = next === "" && CLEARABLE.has(field) ? null : next;
      }
      if (Object.keys(body).length === 0) {
        onClose();
        return;
      }
    } else {
      body = Object.fromEntries(
        CAMPUS_FIELDS.map((field) => [field, CLEARABLE.has(field) ? value(field) || null : value(field)]),
      );
    }

    const sent = await save.send<OrgCampus>(
      campus ? orgApi.campus(organization.id, campus.id) : orgApi.campuses(organization.id),
      { method: campus ? "PATCH" : "POST", body },
    );
    if (!sent.ok) return;
    onSaved();
    onClose();
    // The new or renamed campus shows in the sidebar's campus list.
    void refreshContext().catch(() => undefined);
    toast(
      editing
        ? { title: "Campus saved", description: sent.data.name }
        : {
            title: "Campus opened",
            description: `${sent.data.name} has no roles yet: a platform administrator gives its first one.`,
          },
    );
  }

  const errors = save.fieldErrors;
  const value = (field: CampusField) => campus?.[field] ?? "";

  return (
    <Dialog
      open
      onClose={onClose}
      title={editing ? `Edit ${campus.name}` : "Open a campus"}
      description={editing ? undefined : `A new campus of ${organization.name}. You join it once it is open.`}
      className="max-h-[90vh] max-w-2xl overflow-y-auto"
    >
      <form onSubmit={submit} onChange={save.clear} className="grid gap-5">
        <fieldset disabled={save.submitting} className="grid gap-4 sm:grid-cols-2">
          <legend className="sr-only">Campus details</legend>
          <Field label="Campus name" htmlFor="campus-name" error={errors.name} className="sm:col-span-2">
            <Input id="campus-name" name="name" defaultValue={value("name")} required maxLength={100} autoFocus />
          </Field>
          <Field label="Initials" htmlFor="campus-initials" error={errors.initials} help="Used in admission and invoice numbers.">
            <Input id="campus-initials" name="initials" defaultValue={value("initials")} maxLength={10} />
          </Field>
          <Field label="Phone" htmlFor="campus-phone" error={errors.phone}>
            <Input id="campus-phone" name="phone" type="tel" defaultValue={value("phone")} minLength={5} maxLength={100} />
          </Field>
          <Field label="Email" htmlFor="campus-email" error={errors.email} className="sm:col-span-2">
            <Input id="campus-email" name="email" type="email" defaultValue={value("email")} maxLength={100} />
          </Field>
          <Field label="Address" htmlFor="campus-address" error={errors.address} className="sm:col-span-2">
            <Textarea
              id="campus-address"
              name="address"
              defaultValue={value("address")}
              required={!editing}
              minLength={8}
              maxLength={255}
              rows={2}
            />
          </Field>
          <Field label="City" htmlFor="campus-city" error={errors.city}>
            <Input id="campus-city" name="city" defaultValue={value("city")} required={!editing} maxLength={100} />
          </Field>
          <Field label="State / province" htmlFor="campus-state" error={errors.state}>
            <Input id="campus-state" name="state" defaultValue={value("state")} required={!editing} maxLength={100} />
          </Field>
          <Field label="Postal code" htmlFor="campus-postal" error={errors.postalCode}>
            <Input id="campus-postal" name="postalCode" defaultValue={value("postalCode")} required={!editing} maxLength={30} />
          </Field>
          <Field label="Country" htmlFor="campus-country" error={errors.country}>
            <Input id="campus-country" name="country" defaultValue={value("country")} required={!editing} maxLength={100} />
          </Field>
          <Field
            label="Time zone"
            htmlFor="campus-timezone"
            error={errors.timezone}
            help="Decides the campus's today: which term is open and when registers start."
            className="sm:col-span-2"
          >
            <Select id="campus-timezone" name="timezone" defaultValue={campus?.timezone ?? browserTimeZone()}>
              {zones.map((zone) => (
                <option key={zone} value={zone}>
                  {timeZoneLabel(zone)}
                </option>
              ))}
            </Select>
          </Field>
        </fieldset>
        <FormError error={save.error} fields={CAMPUS_FIELDS} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={save.submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.submitting}>
            {save.submitting ? "Saving…" : editing ? "Save changes" : "Open campus"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------- Billing group

/** PUT …/campuses/:schoolId/billing-group; null bills on its own. */
function BillingGroupDialog({
  organization,
  campus,
  groups,
  onClose,
  onSaved,
}: {
  organization: OrganizationDto;
  campus: OrgCampus;
  groups: BillingGroup[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const save = useApiMutation();
  const [groupId, setGroupId] = useState(campus.billingGroupId ?? "");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const billingGroupId = groupId || null;
    if (billingGroupId === campus.billingGroupId) {
      onClose();
      return;
    }
    const sent = await save.send<OrgCampus>(`${orgApi.campus(organization.id, campus.id)}/billing-group`, {
      method: "PUT",
      body: { billingGroupId },
    });
    if (!sent.ok) return;
    onSaved();
    onClose();
    const group = groups.find((item) => item.id === billingGroupId);
    toast({ title: "Billing changed", description: group ? `${campus.name} now bills with ${group.name}.` : `${campus.name} now bills on its own.` });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Billing for ${campus.name}`}
      description="Campuses in one billing group share their invoicing. Nothing already in the books moves."
    >
      <form onSubmit={submit} className="grid gap-4">
        <Field label="Billing group" htmlFor="billing-group" error={save.fieldErrors.billingGroupId}>
          <Select id="billing-group" value={groupId} onChange={(event) => setGroupId(event.target.value)} disabled={save.submitting}>
            <option value="">Bills on its own</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </Select>
        </Field>
        {groups.length === 0 && (
          <p className="text-sm text-muted-foreground">No billing groups yet. Create one on the organization’s Billing groups tab.</p>
        )}
        <FormError error={save.error} fields={["billingGroupId"]} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={save.submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.submitting}>
            {save.submitting ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------- Calendar template

/**
 * PUT …/campuses/:schoolId/calendar-template. A template of the campus's own
 * needs a reason; null follows the organization default again. The backend
 * does not report which template a campus follows now, so nothing is preselected.
 */
function TemplateDialog({
  organization,
  campus,
  templates,
  onClose,
}: {
  organization: OrganizationDto;
  campus: OrgCampus;
  templates: CalendarTemplate[];
  onClose: () => void;
}) {
  const toast = useToast();
  const save = useApiMutation();
  const [templateId, setTemplateId] = useState("");
  const [reason, setReason] = useState("");
  const fallback = templates.find((template) => template.isDefault);
  const ownTemplate = templateId !== "";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sent = await save.send<OrgCampus>(`${orgApi.campus(organization.id, campus.id)}/calendar-template`, {
      method: "PUT",
      body: { calendarTemplateId: templateId || null, reason: ownTemplate ? reason.trim() : null },
    });
    if (!sent.ok) return;
    onClose();
    const chosen = templates.find((template) => template.id === templateId);
    toast({
      title: "Calendar template set",
      description: chosen ? `${campus.name} follows ${chosen.name}.` : `${campus.name} follows the organization default.`,
    });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Calendar template for ${campus.name}`}
      description="The template its next school years are drafted from. Years already drafted do not change."
    >
      <form onSubmit={submit} onChange={save.clear} className="grid gap-4">
        <Field
          label="Template"
          htmlFor="campus-template"
          error={save.fieldErrors.calendarTemplateId}
          help={fallback ? `The organization default is ${fallback.name}.` : "The organization has no default template yet."}
        >
          <Select id="campus-template" value={templateId} onChange={(event) => setTemplateId(event.target.value)} disabled={save.submitting}>
            <option value="">Follow the organization default</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
                {template.isDefault ? " (default)" : ""}
              </option>
            ))}
          </Select>
        </Field>
        {ownTemplate && (
          <Field label="Why does this campus need its own calendar?" htmlFor="template-reason" error={save.fieldErrors.reason}>
            <Textarea
              id="template-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
              maxLength={500}
              rows={3}
              placeholder="e.g. The campus follows the provincial board's term dates."
              disabled={save.submitting}
            />
          </Field>
        )}
        <FormError error={save.error} fields={["calendarTemplateId", "reason"]} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={save.submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.submitting}>
            {save.submitting ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
