"use client";

import { useMemo, useState } from "react";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, SectionHeading } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { STUDENT_NAMES, createRandom } from "@/lib/mock";

const ASSESSMENTS = [
  { key: "quiz", label: "Quiz 1", max: 10 },
  { key: "assignment", label: "Assignment", max: 20 },
  { key: "midterm", label: "Mid-term", max: 50 },
  { key: "project", label: "Project", max: 20 },
];

function gradeFor(percent: number) {
  if (percent >= 90) return "A+";
  if (percent >= 80) return "A";
  if (percent >= 70) return "B";
  if (percent >= 60) return "C";
  if (percent >= 50) return "D";
  return "F";
}

/** Editable marks for one gradebook: learners down, assessments across. */
export function MarkSheet({ seed }: { seed: number }) {
  const toast = useToast();
  const initial = useMemo(() => {
    const random = createRandom(seed * 31);
    return STUDENT_NAMES.slice(0, 14).map((name) => ({
      name,
      marks: Object.fromEntries(
        ASSESSMENTS.map((assessment) => [
          assessment.key,
          random.chance(0.1) ? "" : String(random.int(Math.round(assessment.max * 0.4), assessment.max)),
        ]),
      ) as Record<string, string>,
    }));
  }, [seed]);
  const [rows, setRows] = useState(initial);
  const [dirty, setDirty] = useState(false);

  const total = ASSESSMENTS.reduce((sum, assessment) => sum + assessment.max, 0);

  return (
    <section aria-labelledby="marks-heading" className="grid gap-4">
      <SectionHeading title="Marks" id="marks-heading">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast({ title: "Marks submitted for approval", description: "The head of department will review them." })}
          >
            Submit for approval
          </Button>
          <Button
            size="sm"
            disabled={!dirty}
            onClick={() => {
              setDirty(false);
              toast({ title: "Marks saved", description: "Demo data only — the backend is not connected yet." });
            }}
          >
            Save marks
          </Button>
        </div>
      </SectionHeading>
      <div className="beautify-scrollbar overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[48rem] text-sm">
          <thead className="bg-muted/50">
            <tr className="border-b">
              <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                Learner
              </th>
              {ASSESSMENTS.map((assessment) => (
                <th key={assessment.key} scope="col" className="px-2 py-3 text-left font-medium text-muted-foreground">
                  {assessment.label}
                  <span className="block text-xs font-normal">out of {assessment.max}</span>
                </th>
              ))}
              <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                Total
              </th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                Grade
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => {
              const sum = ASSESSMENTS.reduce((acc, assessment) => acc + (Number(row.marks[assessment.key]) || 0), 0);
              const percent = Math.round((sum / total) * 100);
              return (
                <tr key={row.name} className="border-b last:border-0">
                  <th scope="row" className="px-4 py-2 text-left font-normal">
                    <span className="flex items-center gap-3">
                      <Avatar name={row.name} size="sm" />
                      <span className="font-medium">{row.name}</span>
                    </span>
                  </th>
                  {ASSESSMENTS.map((assessment) => (
                    <td key={assessment.key} className="px-2 py-2">
                      <input
                        type="number"
                        min={0}
                        max={assessment.max}
                        inputMode="numeric"
                        aria-label={`${row.name} mark for ${assessment.label}`}
                        value={row.marks[assessment.key]}
                        placeholder="—"
                        onChange={(event) => {
                          const value = event.target.value;
                          setDirty(true);
                          setRows((current) =>
                            current.map((entry, index) =>
                              index === rowIndex ? { ...entry, marks: { ...entry.marks, [assessment.key]: value } } : entry,
                            ),
                          );
                        }}
                        className="h-10 w-20 rounded-md border border-input bg-background px-2 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </td>
                  ))}
                  <td className="px-4 py-2 tabular-nums">
                    {sum} / {total} <span className="text-muted-foreground">({percent}%)</span>
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge value={gradeFor(percent)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
