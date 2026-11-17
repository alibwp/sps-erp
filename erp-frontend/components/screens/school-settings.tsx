"use client";

import Link from "next/link";
import { Check, Circle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { SectionHeading } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { SCHOOL } from "@/lib/mock";
import { cn } from "@/lib/utils";

const CHECKLIST = [
  { title: "Add school details", href: "/schools/1/edit", done: true },
  { title: "Create the school year and terms", href: "/academic-years", done: true },
  { title: "Add classes", href: "/academic-levels", done: true },
  { title: "Open sections for this year", href: "/academic-cycle-sections", done: true },
  { title: "Add subjects", href: "/subjects", done: true },
  { title: "Invite teachers", href: "/teachers", done: true },
  { title: "Admit students", href: "/students", done: true },
  { title: "Publish timetables", href: "/timetables", done: true },
  { title: "Publish the exam schedule", href: "/exams", done: false, required: true },
  { title: "Set up fees", href: "/fees", done: false },
];

const FEATURES = [
  { key: "boarding", label: "Boarding", description: "Houses, rolls and nights away." },
  { key: "library", label: "Library", description: "Catalogue, lending desk and reservations." },
  { key: "portal", label: "Parent portal", description: "Families see results, invoices and notices." },
  { key: "finance", label: "Finance", description: "Invoices, payments, budgets and expenses." },
  { key: "health", label: "Health records", description: "Allergies, conditions and emergency contacts." },
  { key: "cases", label: "Cases", description: "Behaviour and safeguarding cases." },
];

const AREAS = [
  { label: "Students", description: "Admission numbers, record statuses and promotion rules.", href: "/students" },
  { label: "Parents and guardians", description: "Who can see a learner's results and invoices.", href: "/parents" },
  { label: "Fees and payments", description: "Fee categories, payment methods and late fees.", href: "/fee-categories" },
  { label: "Notices", description: "Who may publish and how notices are emailed.", href: "/notices" },
  { label: "Staff access", description: "Roles and what each one may do.", href: "/roles" },
  { label: "Timetables", description: "Periods, breaks and the school week.", href: "/timetables" },
];

export function SchoolSettings() {
  const toast = useToast();
  const [features, setFeatures] = useState<Record<string, boolean>>({
    boarding: true, library: true, portal: true, finance: true, health: true, cases: false,
  });
  const done = CHECKLIST.filter((step) => step.done).length;

  return (
    <div className="grid gap-12">
      <section aria-labelledby="setup-heading" className="grid gap-4">
        <SectionHeading title={`Setup · ${done} of ${CHECKLIST.length}`} id="setup-heading" />
        <ol className="grid gap-x-8 sm:grid-cols-2">
          {CHECKLIST.map((step) => (
            <li key={step.title}>
              <Link href={step.href} className="flex min-h-11 items-center gap-3 border-b py-2 text-sm hover:bg-muted/40">
                <span
                  className={cn(
                    "inline-flex size-6 shrink-0 items-center justify-center rounded-full border",
                    step.done ? "border-success bg-success/10 text-success" : "text-muted-foreground",
                  )}
                >
                  {step.done ? <Check className="size-3.5" /> : <Circle className="size-2.5" />}
                </span>
                <span className={cn(step.done && "text-muted-foreground line-through decoration-muted-foreground/40")}>{step.title}</span>
                {step.required && !step.done && <span className="ml-auto text-xs font-medium text-warning">Required</span>}
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="day-heading" className="grid gap-4">
        <SectionHeading title="Day to day" id="day-heading" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {AREAS.map((area) => (
            <Link key={area.label} href={area.href} className="group">
              <Card className="h-full transition-colors group-hover:bg-muted/40">
                <CardHeader>
                  <CardTitle className="text-base">{area.label}</CardTitle>
                  <CardDescription>{area.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="language-heading" className="grid gap-4">
        <SectionHeading title="School language" id="language-heading" />
        <form
          className="grid max-w-3xl gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            toast({ title: "School language saved" });
          }}
        >
          <Field label="School name" htmlFor="school-name">
            <Input id="school-name" defaultValue={SCHOOL.name} />
          </Field>
          <Field label="What you call a term" htmlFor="term-word">
            <Select id="term-word" defaultValue="Term">
              <option>Term</option>
              <option>Semester</option>
              <option>Quarter</option>
            </Select>
          </Field>
          <Field label="What you call a class" htmlFor="class-word">
            <Select id="class-word" defaultValue="Class">
              <option>Class</option>
              <option>Grade</option>
              <option>Year</option>
            </Select>
          </Field>
          <Field label="Currency" htmlFor="currency">
            <Select id="currency" defaultValue="PKR">
              <option value="PKR">Pakistani rupee (Rs)</option>
              <option value="USD">US dollar ($)</option>
            </Select>
          </Field>
          <Field label="Time zone" htmlFor="timezone">
            <Select id="timezone" defaultValue="Asia/Karachi">
              <option>Asia/Karachi</option>
              <option>Asia/Dubai</option>
              <option>UTC</option>
            </Select>
          </Field>
          <Field label="School week" htmlFor="week">
            <Select id="week" defaultValue="Mon–Fri">
              <option>Mon–Fri</option>
              <option>Mon–Sat</option>
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit">Save</Button>
          </div>
        </form>
      </section>

      <section aria-labelledby="features-heading" className="grid gap-4">
        <SectionHeading title="School features" id="features-heading" />
        <Card>
          <CardContent className="divide-y p-0">
            {FEATURES.map((feature) => (
              <label key={feature.key} className="flex cursor-pointer items-center justify-between gap-4 px-6 py-4">
                <span>
                  <span className="block text-sm font-medium">{feature.label}</span>
                  <span className="block text-sm text-muted-foreground">{feature.description}</span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={features[feature.key]}
                  aria-label={feature.label}
                  onClick={() => {
                    const next = !features[feature.key];
                    setFeatures((current) => ({ ...current, [feature.key]: next }));
                    toast({ title: `${feature.label} ${next ? "turned on" : "turned off"}` });
                  }}
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    features[feature.key] ? "bg-primary" : "bg-input",
                  )}
                >
                  <span
                    className={cn(
                      "inline-block size-5 rounded-full bg-background shadow transition-transform",
                      features[feature.key] ? "translate-x-5" : "translate-x-0.5",
                    )}
                  />
                </button>
              </label>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
