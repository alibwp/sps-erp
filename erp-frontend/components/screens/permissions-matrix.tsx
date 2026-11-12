"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";

const AREAS = [
  "Students", "Teachers", "Parents", "Sections", "Subjects", "Timetables", "Attendance",
  "Exams", "Gradebooks", "Report cards", "Fee invoices", "Budgets", "Notices", "Library", "Settings",
];
const ACTIONS = ["Read", "Create", "Update", "Delete"] as const;

function defaultsFor(role: string) {
  const full = role === "Super admin" || role === "Admin";
  const readOnly = role === "Student" || role === "Parent";
  return Object.fromEntries(
    AREAS.flatMap((area, areaIndex) =>
      ACTIONS.map((action, actionIndex) => [
        `${area}:${action}`,
        full || (readOnly ? action === "Read" && areaIndex % 3 !== 2 : actionIndex < 3 && areaIndex % 4 !== 3),
      ]),
    ),
  ) as Record<string, boolean>;
}

/** Tick-box grid of what a role may read, create, update and delete. */
export function PermissionsMatrix({ role }: { role: string }) {
  const toast = useToast();
  const [granted, setGranted] = useState(() => defaultsFor(role));
  const count = Object.values(granted).filter(Boolean).length;

  return (
    <section aria-labelledby="permissions-heading" className="grid gap-4">
      <SectionHeading title={`Permissions · ${count} granted`} id="permissions-heading">
        <Button size="sm" onClick={() => toast({ title: `${role} permissions saved`, description: "Demo data only — the backend is not connected yet." })}>
          Save permissions
        </Button>
      </SectionHeading>
      <div className="beautify-scrollbar overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[32rem] text-sm">
          <thead className="bg-muted/50">
            <tr className="border-b">
              <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                Area
              </th>
              {ACTIONS.map((action) => (
                <th key={action} scope="col" className="px-4 py-3 text-center font-medium text-muted-foreground">
                  {action}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {AREAS.map((area) => (
              <tr key={area} className="border-b last:border-0 hover:bg-muted/30">
                <th scope="row" className="px-4 py-2.5 text-left font-medium">
                  {area}
                </th>
                {ACTIONS.map((action) => {
                  const key = `${area}:${action}`;
                  return (
                    <td key={action} className="px-4 py-2.5 text-center">
                      <input
                        type="checkbox"
                        aria-label={`${action} ${area.toLowerCase()}`}
                        checked={granted[key]}
                        onChange={(event) => setGranted((current) => ({ ...current, [key]: event.target.checked }))}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
