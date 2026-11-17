"use client";

import { Building2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, type ReactNode } from "react";
import { Loaded } from "@/components/ui/api-states";
import { Select } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/misc";
import type { Paginated } from "@/lib/api";
import { orgApi, type OrganizationDto } from "@/lib/organizations";
import { useApiQuery, type ApiQuery } from "@/lib/use-api";

export type OrganizationChoice = {
  query: ApiQuery<Paginated<OrganizationDto>>;
  organizations: OrganizationDto[];
  /** The organization in ?org=, else the first one. */
  organization: OrganizationDto | null;
  choose: (id: string) => void;
};

/**
 * The organization an organization-level screen works on. It lives in the
 * address (?org=…) so links, reloads and the back button keep it.
 */
export function useOrganizationChoice(): OrganizationChoice {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  // Every organization the person can read; a platform has a handful, not hundreds.
  const query = useApiQuery<Paginated<OrganizationDto>>(`${orgApi.list}?perPage=100`, { keepPrevious: true });
  const organizations = query.data?.data ?? [];
  const wanted = params.get("org");
  const organization = organizations.find((item) => item.id === wanted) ?? organizations[0] ?? null;

  const choose = useCallback(
    (id: string) => {
      const next = new URLSearchParams(params.toString());
      next.set("org", id);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  return { query, organizations, organization, choose };
}

/** A select between organizations; hidden when there is only one. */
export function OrganizationPicker({ choice }: { choice: OrganizationChoice }) {
  if (choice.organizations.length <= 1 || !choice.organization) return null;
  return (
    <label className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
      <Building2 className="size-4 shrink-0" aria-hidden />
      <span className="shrink-0">Organization</span>
      <Select
        className="h-9 max-w-72"
        value={choice.organization.id}
        onChange={(event) => choice.choose(event.target.value)}
      >
        {choice.organizations.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </Select>
    </label>
  );
}

/** Loading, failure and "no organization" for a screen that needs one. */
export function WithOrganization({
  choice,
  children,
}: {
  choice: OrganizationChoice;
  children: (organization: OrganizationDto) => ReactNode;
}) {
  return (
    <Loaded query={choice.query}>
      {() =>
        choice.organization ? (
          children(choice.organization)
        ) : (
          <EmptyState
            icon={Building2}
            title="No organization"
            description="You do not administer an organization. A platform administrator can create one or add you to one."
          />
        )
      }
    </Loaded>
  );
}
