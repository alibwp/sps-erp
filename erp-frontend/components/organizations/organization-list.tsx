"use client";

import Link from "next/link";
import { Building2, Ellipsis, Eye, Pencil, Plus } from "lucide-react";
import { useCallback, useState } from "react";
import { useWorkingContext } from "@/components/auth/session";
import { Loaded } from "@/components/ui/api-states";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuLink } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/misc";
import { Pagination, SearchBox, Table, TD, TH, THead, TR } from "@/components/ui/table";
import { withQuery, type Paginated } from "@/lib/api";
import { ACCESS_ALL_ORGANIZATIONS, orgApi, orgCan, OrgPermission, type OrganizationDto } from "@/lib/organizations";
import { useApiQuery } from "@/lib/use-api";
import { formatDate } from "@/lib/utils";

const PER_PAGE = 10;

/** "New organization", for platform administrators only. */
export function NewOrganizationButton() {
  const { can } = useWorkingContext();
  if (!can(ACCESS_ALL_ORGANIZATIONS)) return null;
  return (
    <ButtonLink href="/organizations/create">
      <Plus /> New organization
    </ButtonLink>
  );
}

/** What the signed-in person may do in an organization, in a word. */
export function AccessBadge({ organization }: { organization: OrganizationDto }) {
  const delegable = Object.values(OrgPermission).filter((permission) => permission !== OrgPermission.Read);
  const held = delegable.filter((permission) => orgCan(organization, permission)).length;
  if (held === delegable.length) return <Badge tone="success">Full access</Badge>;
  if (held === 0) return <Badge>Read only</Badge>;
  return <Badge tone="info">Partial access</Badge>;
}

/**
 * Every organization a platform administrator sees, or the ones the person
 * administers, searchable and paged by the backend.
 */
export function OrganizationList() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const list = useApiQuery<Paginated<OrganizationDto>>(withQuery(orgApi.list, { page, perPage: PER_PAGE, search }), {
    keepPrevious: true,
  });
  const onSearch = useCallback((text: string) => {
    setSearch(text);
    setPage(1);
  }, []);

  return (
    <div className="grid gap-4">
      <SearchBox label="Search by name or code" onSearch={onSearch} />
      <Loaded query={list}>
        {({ data, meta }) =>
          data.length === 0 ? (
            <EmptyState
              icon={Building2}
              title={search ? "No organization matches" : "No organizations yet"}
              description={search ? "Try another name or code." : "Organizations you can read appear here."}
            />
          ) : (
            <>
              <Table busy={list.loading}>
                <THead>
                  <TH>Organization</TH>
                  <TH>Email</TH>
                  <TH>Phone</TH>
                  <TH>Your access</TH>
                  <TH>Created</TH>
                  <TH className="text-right">
                    <span className="sr-only">Actions</span>
                  </TH>
                </THead>
                <tbody>
                  {data.map((organization) => (
                    <TR key={organization.id}>
                      <TD>
                        <Link href={`/organizations/${organization.id}`} className="font-medium hover:underline hover:underline-offset-4">
                          {organization.name}
                        </Link>
                        <span className="block font-mono text-xs text-muted-foreground">{organization.code}</span>
                      </TD>
                      <TD>{organization.email ?? "—"}</TD>
                      <TD>{organization.phone ?? "—"}</TD>
                      <TD>
                        <AccessBadge organization={organization} />
                      </TD>
                      <TD className="whitespace-nowrap">{formatDate(organization.createdAt)}</TD>
                      <TD className="py-2 text-right">
                        <DropdownMenu
                          trigger={<Ellipsis className="size-4" />}
                          triggerLabel={`Actions for ${organization.name}`}
                          triggerClassName="size-9"
                          className="w-48"
                        >
                          <DropdownMenuLink href={`/organizations/${organization.id}`}>
                            <Eye /> View
                          </DropdownMenuLink>
                          {orgCan(organization, OrgPermission.Manage) && (
                            <DropdownMenuLink href={`/organizations/${organization.id}/edit`}>
                              <Pencil /> Edit
                            </DropdownMenuLink>
                          )}
                        </DropdownMenu>
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
              <Pagination page={meta.page} perPage={meta.perPage} total={meta.total} onPage={setPage} />
            </>
          )
        }
      </Loaded>
    </div>
  );
}
