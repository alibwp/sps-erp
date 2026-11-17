"use client";

import { GraduationCap, Users } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useWorkingContext } from "@/components/auth/session";
import { AccountTable, useAllAccounts } from "@/components/people/accounts";
import { Loaded } from "@/components/ui/api-states";
import { Select } from "@/components/ui/form";
import { Alert, EmptyState } from "@/components/ui/misc";
import { Pagination, SearchBox } from "@/components/ui/table";
import { ACCOUNT_STATUS_LABELS, ROLE_NAMES, type AccountStatus } from "@/lib/people";

const PER_PAGE = 20;

const COPY = {
  teacher: {
    icon: GraduationCap,
    empty: "No teachers yet",
    emptyHint: "Add a person with the teacher role, or give the role on someone's account page.",
  },
  parent: {
    icon: Users,
    empty: "No parents yet",
    emptyHint: "Parents with an account at this campus appear here.",
  },
} as const;

/**
 * /teachers and /parents: the campus's accounts holding that role. The
 * account list has no role filter, so every account is read and filtered
 * here; search and paging are local.
 *
 * Only what the backend keeps is shown. Accounts have no qualification,
 * main subject, occupation or relationship, and no link from a parent to
 * their children, so none of those appear.
 */
export function RoleMembers({ role }: { role: keyof typeof ROLE_NAMES }) {
  const { ready, can } = useWorkingContext();
  const accounts = useAllAccounts();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<AccountStatus | "">("");
  const [page, setPage] = useState(1);
  const copy = COPY[role];
  // Stable, so the search box does not reset the page on every render.
  const onSearch = useCallback((text: string) => {
    setSearch(text);
    setPage(1);
  }, []);

  const members = useMemo(() => {
    const needle = search.toLowerCase();
    return (accounts.data ?? [])
      .filter((account) => account.roles.some((held) => held.name === ROLE_NAMES[role]))
      .filter((account) => !status || account.accountStatus === status)
      .filter((account) => !needle || account.name.toLowerCase().includes(needle) || account.email.toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [accounts.data, role, search, status]);

  if (ready && !can("manage account access")) {
    return (
      <Alert tone="warning" title="You cannot see this list">
        The people of the campus are listed for those with the “manage account access” permission.
      </Alert>
    );
  }

  const pageCount = Math.max(1, Math.ceil(members.length / PER_PAGE));
  const current = Math.min(page, pageCount);
  const shown = members.slice((current - 1) * PER_PAGE, current * PER_PAGE);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox label="Search by name or email" onSearch={onSearch} />
        <Select
          className="h-9 w-40"
          aria-label="Account status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as AccountStatus | "");
            setPage(1);
          }}
        >
          <option value="">Every status</option>
          {(Object.keys(ACCOUNT_STATUS_LABELS) as AccountStatus[]).map((value) => (
            <option key={value} value={value}>
              {ACCOUNT_STATUS_LABELS[value]}
            </option>
          ))}
        </Select>
      </div>
      <Loaded query={accounts}>
        {() =>
          members.length === 0 ? (
            <EmptyState icon={copy.icon} title={search || status ? "Nobody matches" : copy.empty} description={search || status ? undefined : copy.emptyHint} />
          ) : (
            <>
              <AccountTable accounts={shown} busy={accounts.loading} />
              <Pagination page={current} perPage={PER_PAGE} total={members.length} onPage={setPage} />
            </>
          )
        }
      </Loaded>
    </div>
  );
}
