"use client";

import { Check } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Avatar, SectionHeading } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { DEMO_TODAY, SECTIONS, STUDENT_NAMES, SUBJECTS, createRandom } from "@/lib/mock";
import { cn } from "@/lib/utils";

const MARKS = [
  { value: "present", label: "Present", short: "P", active: "border-success bg-success/10 text-success" },
  { value: "late", label: "Late", short: "L", active: "border-warning bg-warning/10 text-warning" },
  { value: "absent", label: "Absent", short: "A", active: "border-destructive bg-destructive/10 text-destructive" },
  { value: "excused", label: "Excused", short: "E", active: "border-foreground/40 bg-muted text-foreground" },
] as const;

type Mark = (typeof MARKS)[number]["value"];

function learnersFor(section: string) {
  const index = Math.max(0, SECTIONS.indexOf(section));
  return Array.from({ length: 16 }, (_, offset) => STUDENT_NAMES[(index * 5 + offset) % STUDENT_NAMES.length]);
}

/** Take a register for a section: one mark per learner, plus a note. */
export function AttendanceRegister() {
  const toast = useToast();
  const [section, setSection] = useState(SECTIONS[8]);
  const [register, setRegister] = useState("Daily");
  const learners = useMemo(() => learnersFor(section), [section]);
  const [marks, setMarks] = useState<Record<string, Mark>>(() => seedMarks(learnersFor(SECTIONS[8])));
  const [notes, setNotes] = useState<Record<string, string>>({});

  const tally = MARKS.map((mark) => ({ ...mark, count: learners.filter((name) => marks[name] === mark.value).length }));
  const unmarked = learners.filter((name) => !marks[name]).length;

  return (
    <div className="grid gap-8">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Register">
        <Field label="Section" htmlFor="register-section">
          <Select
            id="register-section"
            value={section}
            onChange={(event) => {
              setSection(event.target.value);
              setMarks(seedMarks(learnersFor(event.target.value)));
              setNotes({});
            }}
          >
            {SECTIONS.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </Select>
        </Field>
        <Field label="Day" htmlFor="register-day">
          <Input id="register-day" type="date" defaultValue={DEMO_TODAY} max={DEMO_TODAY} />
        </Field>
        <Field label="Register" htmlFor="register-kind">
          <Select id="register-kind" value={register} onChange={(event) => setRegister(event.target.value)}>
            <option>Daily</option>
            <option>Lesson</option>
          </Select>
        </Field>
        {register === "Lesson" ? (
          <Field label="Subject" htmlFor="register-subject">
            <Select id="register-subject">
              {SUBJECTS.map((subject) => (
                <option key={subject}>{subject}</option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="Session" htmlFor="register-session">
            <Select id="register-session">
              <option>Morning</option>
              <option>Afternoon</option>
            </Select>
          </Field>
        )}
      </section>

      <section aria-labelledby="register-heading" className="grid gap-4">
        <SectionHeading title={`${section} · ${learners.length} learners`} id="register-heading">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMarks(Object.fromEntries(learners.map((name) => [name, "present" as Mark])))}
            >
              <Check /> Mark all present
            </Button>
            <Button
              size="sm"
              onClick={() =>
                toast(
                  unmarked > 0
                    ? { title: `${unmarked} learners still need a mark`, tone: "error" }
                    : { title: "Register saved", description: `${section} · demo data only, the backend is not connected yet.` },
                )
              }
            >
              Save register
            </Button>
          </div>
        </SectionHeading>

        <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          {tally.map((mark) => (
            <div key={mark.value} className="flex items-baseline gap-2">
              <dt className="text-muted-foreground">{mark.label}</dt>
              <dd className="font-semibold tabular-nums">{mark.count}</dd>
            </div>
          ))}
          <div className="flex items-baseline gap-2">
            <dt className="text-muted-foreground">Not marked</dt>
            <dd className="font-semibold tabular-nums">{unmarked}</dd>
          </div>
        </dl>

        <ul className="divide-y rounded-lg border">
          {learners.map((name) => (
            <li key={name} className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,16rem)]">
              <span className="flex min-w-0 items-center gap-3">
                <Avatar name={name} size="sm" />
                <span className="truncate font-medium">{name}</span>
              </span>
              <div className="flex gap-1.5" role="radiogroup" aria-label={`Attendance for ${name}`}>
                {MARKS.map((mark) => {
                  const selected = marks[name] === mark.value;
                  return (
                    <button
                      key={mark.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={mark.label}
                      title={mark.label}
                      onClick={() => setMarks((current) => ({ ...current, [name]: mark.value }))}
                      className={cn(
                        "inline-flex h-10 min-w-10 items-center justify-center rounded-md border px-3 text-sm font-medium transition-colors sm:min-w-20",
                        selected ? mark.active : "border-input text-muted-foreground hover:bg-accent",
                      )}
                    >
                      <span className="sm:hidden">{mark.short}</span>
                      <span className="hidden sm:inline">{mark.label}</span>
                    </button>
                  );
                })}
              </div>
              <input
                aria-label={`Note for ${name}`}
                placeholder="Note (optional)"
                value={notes[name] ?? ""}
                onChange={(event) => setNotes((current) => ({ ...current, [name]: event.target.value }))}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:col-span-2 lg:col-span-1"
              />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function seedMarks(learners: string[]): Record<string, Mark> {
  const random = createRandom(learners.length + learners[0].length);
  return Object.fromEntries(
    learners.flatMap((name) => {
      const roll = random.next();
      if (roll < 0.15) return [];
      return [[name, roll < 0.85 ? "present" : roll < 0.93 ? "late" : "absent"]];
    }),
  ) as Record<string, Mark>;
}
