"use client";

import Link from "next/link";
import { Check, Circle, ImageOff } from "lucide-react";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { refreshContext, useWorkingContext } from "@/components/auth/session";
import { FormError, FormSection, Loaded } from "@/components/ui/api-states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert, Progress, SectionHeading } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { timeZoneLabel, timeZones } from "@/lib/time-zones";
import { useApiMutation, useApiQuery } from "@/lib/use-api";
import { cn, formatDate } from "@/lib/utils";

// The working campus's settings: setup checklist, details, logo, the words the
// campus uses, and which features are on. Everything reads from and writes to
// the backend at the working campus (X-School-Id), so switching campus in the
// sidebar shows that campus's settings.
//
// Who may change what is the backend's call: "update school" or "manage school
// settings" at the campus, or "manage organization campuses" over its
// organization. GET /v1/school/setup needs exactly that, so its answer also
// tells the page whether to offer editing to an organization manager.

// ---------------------------------------------------------------- Backend shapes

/** GET/PATCH /v1/school, POST/DELETE /v1/school/logo. */
type CampusDto = {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  initials: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  timezone: string;
  phone: string | null;
  email: string | null;
  /** Signed link, valid 15 minutes. */
  logoUrl: string | null;
  setupDetailsCompletedAt: string | null;
};

type Preset = "home_sections" | "subject_schedule" | "hybrid";
type LabelKey = "academic_year" | "class_level" | "section" | "period" | "course" | "fee" | "homeroom_teacher";
type Labels = Record<LabelKey, string>;

/** GET/PUT /v1/school/operating-profile. */
type OperatingProfile = { preset: Preset; labels: Labels; setupCompletedAt: string | null };

/** GET /v1/school/features, PUT /v1/school/features/:feature. */
type FeatureState = {
  feature: string;
  label: string;
  description: string;
  group: string;
  enabled: boolean;
  defaultEnabled: boolean;
  source: "campus" | "platform" | "default";
  config: Record<string, boolean> | null;
};

type ChecklistItem = {
  key: string;
  title: string;
  description: string;
  /** Why it is not done; empty when done. */
  reason: string;
  complete: boolean;
  required: boolean;
  group: string;
};

/** GET /v1/school/setup, POST /v1/school/setup/acknowledge. */
export type SchoolSetup = {
  academicYearId: string | null;
  items: ChecklistItem[];
  completed: number;
  total: number;
  requiredRemaining: number;
  /** Key of the next item to do. */
  next: string | null;
  phase: {
    key: string;
    status: "in_progress" | "ready" | "acknowledged";
    acknowledgedAt: string | null;
  };
};

// ---------------------------------------------------------------- Page

export function SchoolSettings() {
  const { schoolId, can } = useWorkingContext();
  const path = (route: string) => (schoolId ? route : null);

  const setup = useApiQuery<SchoolSetup>(path("/v1/school/setup"), { keepPrevious: true });
  const school = useApiQuery<CampusDto>(path("/v1/school"), { keepPrevious: true });
  const profile = useApiQuery<OperatingProfile>(path("/v1/school/operating-profile"), { keepPrevious: true });
  const features = useApiQuery<FeatureState[]>(path("/v1/school/features"), { keepPrevious: true });

  // Campus permissions settle it at once; an organization manager is known
  // once the setup (same rule as editing) answers.
  const canEdit = can("update school") || can("manage school settings") || setup.data !== undefined;

  // The app shell already explains a missing campus.
  if (!schoolId) return null;

  /** After the details change: the checklist's first step, and the campus name in the header. */
  function detailsChanged() {
    school.reload();
    setup.reload();
    void refreshContext().catch(() => undefined);
  }

  return (
    <div className="grid max-w-5xl gap-10">
      {canEdit && (
        <FormSection
          id="setup"
          title="Setup checklist"
          description="What this campus still needs before the school year can run. It follows your working school year."
        >
          <Loaded query={setup}>{(data) => <SetupChecklist setup={data} onChanged={setup.reload} />}</Loaded>
        </FormSection>
      )}

      <FormSection
        id="school-profile"
        title="School profile"
        description="The campus name, contact details and address shown on documents, invoices and report cards."
      >
        <Loaded query={school}>
          {(data) => <ProfileSection school={data} canEdit={canEdit} onSaved={detailsChanged} />}
        </Loaded>
      </FormSection>

      <FormSection id="logo" title="Logo" description="Shown on documents, invoices and report cards. JPG or PNG, up to 5 MB.">
        <Loaded query={school}>{(data) => <LogoSection school={data} canEdit={canEdit} onChanged={school.reload} />}</Loaded>
      </FormSection>

      <FormSection
        id="language"
        title="School language"
        description="The words this campus uses across the app, such as Class or Grade, Term or Semester."
      >
        <Loaded query={profile}>
          {(data) => <LanguageSection profile={data} canEdit={canEdit} onSaved={profile.reload} />}
        </Loaded>
      </FormSection>

      <FormSection
        id="features"
        title="Features"
        description="Switch parts of the app on or off for this campus. Switching a feature off hides it and keeps its records."
      >
        <Loaded query={features}>
          {(data) => <FeaturesSection features={data} canEdit={canEdit} onChanged={features.reload} />}
        </Loaded>
      </FormSection>

      <QuickLinks />
    </div>
  );
}

// ---------------------------------------------------------------- 4.5 Setup checklist

/** Where each checklist step is done. */
export const STEP_LINKS: Record<string, string> = {
  school_details: "#school-profile",
  academic_year: "/academic-years",
  academic_periods: "/academic-years",
  instructional_model: "/academic-years",
  academic_levels: "/academic-levels",
  cycle_sections: "/academic-cycle-sections",
  course_offerings: "/course-offerings",
  grading_scales: "/grading-scales",
  staff_access: "/roles",
  student_records: "/students",
};

const PHASE_BADGE = {
  in_progress: { label: "In progress", tone: "warning" },
  ready: { label: "Ready to confirm", tone: "info" },
  acknowledged: { label: "Confirmed", tone: "success" },
} as const;

function SetupChecklist({ setup, onChanged }: { setup: SchoolSetup; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useApiMutation();
  const percent = setup.total > 0 ? Math.round((setup.completed / setup.total) * 100) : 0;
  const badge = PHASE_BADGE[setup.phase.status] ?? PHASE_BADGE.in_progress;

  // Items in the backend's order, gathered under their group.
  const groups = useMemo(() => {
    const byGroup = new Map<string, ChecklistItem[]>();
    for (const item of setup.items) byGroup.set(item.group, [...(byGroup.get(item.group) ?? []), item]);
    return [...byGroup.entries()];
  }, [setup.items]);

  async function acknowledge() {
    const sent = await confirm.send<SchoolSetup>("/v1/school/setup/acknowledge", { method: "POST" });
    if (!sent.ok) return;
    onChanged();
    toast({ title: "Setup confirmed", description: "The campus is ready for the school year." });
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>
            <span className="font-medium">
              {setup.completed} of {setup.total}
            </span>{" "}
            steps done
            {setup.requiredRemaining > 0 && (
              <span className="text-muted-foreground"> · {setup.requiredRemaining} required left</span>
            )}
          </span>
          <Badge tone={badge.tone}>{badge.label}</Badge>
        </div>
        <Progress value={percent} label={`Setup ${percent}% done`} />
      </div>

      {setup.academicYearId === null && (
        <Alert tone="warning" title="No working school year">
          The checklist follows your working school year. <Link href="/academic-years" className="underline">Create one</Link> to
          begin.
        </Alert>
      )}

      {setup.phase.status === "ready" && (
        <Alert tone="success" title="Every required step is done">
          <div className="grid justify-items-start gap-3">
            <span>Confirm the setup to mark this campus ready for the school year.</span>
            <Button size="sm" onClick={() => void acknowledge()} disabled={confirm.submitting}>
              {confirm.submitting ? "Confirming…" : "Confirm setup"}
            </Button>
          </div>
        </Alert>
      )}
      {setup.phase.status === "acknowledged" && setup.phase.acknowledgedAt && (
        <p className="text-sm text-muted-foreground">Setup confirmed on {formatDate(setup.phase.acknowledgedAt)}.</p>
      )}
      <FormError error={confirm.error} />

      {groups.map(([group, items]) => (
        <div key={group} className="grid gap-1">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{group}</h3>
          <ol className="grid">
            {items.map((item) => (
              <li key={item.key}>
                <ChecklistRow item={item} next={item.key === setup.next} />
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

function ChecklistRow({ item, next }: { item: ChecklistItem; next: boolean }) {
  const href = STEP_LINKS[item.key];
  const content = (
    <>
      <span
        className={cn(
          "mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border",
          item.complete ? "border-success bg-success/10 text-success" : "text-muted-foreground",
        )}
        aria-hidden
      >
        {item.complete ? <Check className="size-3.5" /> : <Circle className="size-2.5" />}
      </span>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className={cn("text-sm", item.complete ? "text-muted-foreground" : "font-medium")}>
          {item.title}
          <span className="sr-only">{item.complete ? " (done)" : " (not done)"}</span>
        </span>
        <span className="text-xs text-muted-foreground">{item.complete ? item.description : item.reason || item.description}</span>
      </span>
      {!item.complete && (
        <span className="flex shrink-0 flex-col items-end gap-1">
          {item.required && <span className="text-xs font-medium text-warning">Required</span>}
          {next && <Badge tone="solid">Next</Badge>}
        </span>
      )}
    </>
  );
  const classes = "flex items-start gap-3 border-b py-3";
  if (!href) return <div className={classes}>{content}</div>;
  return (
    <Link href={href} className={cn(classes, "-mx-2 rounded-md px-2 transition-colors hover:bg-muted/40")}>
      {content}
    </Link>
  );
}

// ---------------------------------------------------------------- 4.1 School profile

const PROFILE_FIELDS = [
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
type ProfileField = (typeof PROFILE_FIELDS)[number];

/** Fields the backend accepts as null; the others must have a value once set. */
const CLEARABLE = new Set<ProfileField>(["initials", "phone", "email"]);

function ProfileSection({ school, canEdit, onSaved }: { school: CampusDto; canEdit: boolean; onSaved: () => void }) {
  const toast = useToast();
  const save = useApiMutation();
  const zones = useMemo(() => timeZones(school.timezone), [school.timezone]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    // PATCH changes only the fields sent, so only what was edited goes.
    const body: Partial<Record<ProfileField, string | null>> = {};
    for (const field of PROFILE_FIELDS) {
      const value = String(form.get(field) ?? "").trim();
      if (value === (school[field] ?? "")) continue;
      body[field] = value === "" && CLEARABLE.has(field) ? null : value;
    }
    if (Object.keys(body).length === 0) {
      toast({ title: "Nothing to save", description: "No field was changed." });
      return;
    }
    const sent = await save.send<CampusDto>("/v1/school", { method: "PATCH", body });
    if (!sent.ok) return;
    onSaved();
    toast({ title: "School profile saved" });
  }

  const errors = save.fieldErrors;

  return (
    // Re-mount on every new answer so the boxes show what was saved.
    <form key={JSON.stringify(school)} onSubmit={submit} onChange={save.clear}>
      <fieldset disabled={!canEdit || save.submitting} className="grid gap-5 sm:grid-cols-2">
        <legend className="sr-only">School profile</legend>
        <Field label="School name" htmlFor="name" error={errors.name} className="sm:col-span-2">
          <Input id="name" name="name" defaultValue={school.name} required maxLength={100} autoComplete="organization" />
        </Field>
        <Field label="Campus code" htmlFor="code" help="Set when the campus was opened; it cannot be changed.">
          <Input id="code" value={school.code} readOnly className="bg-muted/50" />
        </Field>
        <Field label="Initials" htmlFor="initials" error={errors.initials} help="Used in admission and invoice numbers.">
          <Input id="initials" name="initials" defaultValue={school.initials ?? ""} maxLength={10} />
        </Field>
        <Field label="Phone" htmlFor="phone" error={errors.phone}>
          <Input id="phone" name="phone" type="tel" defaultValue={school.phone ?? ""} minLength={5} maxLength={100} autoComplete="tel" />
        </Field>
        <Field label="Email" htmlFor="email" error={errors.email}>
          <Input id="email" name="email" type="email" defaultValue={school.email ?? ""} maxLength={100} autoComplete="email" />
        </Field>
        <Field label="Address" htmlFor="address" error={errors.address} className="sm:col-span-2">
          <Input
            id="address"
            name="address"
            defaultValue={school.address ?? ""}
            minLength={8}
            maxLength={255}
            autoComplete="street-address"
          />
        </Field>
        <Field label="City" htmlFor="city" error={errors.city}>
          <Input id="city" name="city" defaultValue={school.city ?? ""} maxLength={100} autoComplete="address-level2" />
        </Field>
        <Field label="State / province" htmlFor="state" error={errors.state}>
          <Input id="state" name="state" defaultValue={school.state ?? ""} maxLength={100} autoComplete="address-level1" />
        </Field>
        <Field label="Postal code" htmlFor="postalCode" error={errors.postalCode}>
          <Input id="postalCode" name="postalCode" defaultValue={school.postalCode ?? ""} maxLength={30} autoComplete="postal-code" />
        </Field>
        <Field label="Country" htmlFor="country" error={errors.country}>
          <Input id="country" name="country" defaultValue={school.country ?? ""} maxLength={100} autoComplete="country-name" />
        </Field>
        <Field
          label="Time zone"
          htmlFor="timezone"
          error={errors.timezone}
          help="Decides the campus's today: which term is open and when the day's registers start."
          className="sm:col-span-2"
        >
          <Select id="timezone" name="timezone" defaultValue={school.timezone}>
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {timeZoneLabel(zone)}
              </option>
            ))}
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <FormError error={save.error} fields={PROFILE_FIELDS} />
        </div>
        {canEdit && (
          <div className="sm:col-span-2">
            <Button type="submit">{save.submitting ? "Saving…" : "Save"}</Button>
          </div>
        )}
      </fieldset>
      {!canEdit && <p className="mt-4 text-sm text-muted-foreground">You can view these details but not change them.</p>}
    </form>
  );
}

// ---------------------------------------------------------------- 4.2 Logo

const LOGO_MAX_BYTES = 5120 * 1024;
const LOGO_TYPES = ["image/jpeg", "image/png"];

function LogoSection({ school, canEdit, onChanged }: { school: CampusDto; canEdit: boolean; onChanged: () => void }) {
  const toast = useToast();
  const logo = useApiMutation();
  const input = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [broken, setBroken] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  async function upload(file: File) {
    // Checked here too so a wrong file fails at once instead of after the upload.
    if (!LOGO_TYPES.includes(file.type)) {
      setLocalError("Choose a JPG or PNG image.");
    } else if (file.size > LOGO_MAX_BYTES) {
      setLocalError("The logo must be 5 MB or smaller.");
    } else {
      setLocalError(null);
      const body = new FormData();
      body.append("logo", file);
      const sent = await logo.send<CampusDto>("/v1/school/logo", { method: "POST", body });
      if (sent.ok) {
        onChanged();
        toast({ title: "Logo updated" });
      }
    }
    if (input.current) input.current.value = "";
  }

  async function remove() {
    const sent = await logo.send<CampusDto>("/v1/school/logo", { method: "DELETE" });
    if (!sent.ok) return;
    onChanged();
    toast({ title: "Logo removed" });
  }

  // Signed links expire after 15 minutes; a failed load shows the placeholder.
  const showImage = school.logoUrl !== null && broken !== school.logoUrl;
  const error = localError ?? (logo.error ? (logo.fieldErrors.logo ?? logo.error.message) : null);

  return (
    <div className="flex flex-wrap items-start gap-5">
      <div className="flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-white">
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed backend link, not a static asset
          <img
            src={school.logoUrl ?? undefined}
            alt={`${school.name} logo`}
            className="size-full object-contain p-2"
            onError={() => setBroken(school.logoUrl)}
          />
        ) : (
          <span className="flex flex-col items-center gap-1 text-xs text-neutral-500">
            <ImageOff className="size-6" aria-hidden />
            No logo
          </span>
        )}
      </div>

      {canEdit ? (
        <div className="grid min-w-0 gap-2">
          <label htmlFor="logo" className="text-sm text-muted-foreground">
            {school.logoUrl ? "Replace the logo" : "Upload a logo"}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              ref={input}
              id="logo"
              type="file"
              accept={LOGO_TYPES.join(",")}
              disabled={logo.submitting}
              className="max-w-xs"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void upload(file);
              }}
            />
            {school.logoUrl && (
              <Button variant="outline" size="sm" disabled={logo.submitting} onClick={() => setConfirmRemove(true)}>
                Remove logo
              </Button>
            )}
          </div>
          {logo.submitting && <p className="text-xs text-muted-foreground">Saving…</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <ConfirmDialog
            open={confirmRemove}
            onClose={() => setConfirmRemove(false)}
            onConfirm={() => void remove()}
            title="Remove the logo?"
            description="Documents, invoices and report cards will show the school name without a logo."
            confirmLabel="Remove logo"
          />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">You can view the logo but not change it.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 4.3 School language (operating profile)

const PRESETS: ReadonlyArray<{ value: Preset; label: string; description: string }> = [
  {
    value: "home_sections",
    label: "Classes with sections",
    description: "Learners stay in one section with a class teacher. Most primary and secondary schools.",
  },
  {
    value: "subject_schedule",
    label: "Grades with a subject timetable",
    description: "Learners move between courses each period, with a homeroom for registration.",
  },
  {
    value: "hybrid",
    label: "Mixed",
    description: "Sections in the lower grades, subject timetables in the upper ones.",
  },
];

// The words each preset starts with (the backend's PRESET_LABELS). Picking a
// preset fills them in; each can still be changed before saving.
const PRESET_LABELS: Record<Preset, Labels> = {
  home_sections: {
    academic_year: "Academic year",
    class_level: "Class",
    section: "Section",
    period: "Term",
    course: "Subject",
    fee: "School fees",
    homeroom_teacher: "Class teacher",
  },
  subject_schedule: {
    academic_year: "Academic year",
    class_level: "Grade",
    section: "Homeroom",
    period: "Semester",
    course: "Course",
    fee: "Tuition",
    homeroom_teacher: "Class teacher",
  },
  hybrid: {
    academic_year: "Academic year",
    class_level: "Grade",
    section: "Section",
    period: "Term",
    course: "Subject",
    fee: "Fees",
    homeroom_teacher: "Class teacher",
  },
};

const LABEL_FIELDS: ReadonlyArray<{ key: LabelKey; label: string; help: string }> = [
  { key: "academic_year", label: "School year", help: "e.g. Academic year, Session" },
  { key: "class_level", label: "Class level", help: "e.g. Class, Grade, Year" },
  { key: "section", label: "Group within a class", help: "e.g. Section, Homeroom, Stream" },
  { key: "period", label: "Reporting period", help: "e.g. Term, Semester, Quarter" },
  { key: "course", label: "What is taught", help: "e.g. Subject, Course" },
  { key: "fee", label: "What families pay", help: "e.g. School fees, Tuition" },
  { key: "homeroom_teacher", label: "Teacher in charge of a group", help: "e.g. Class teacher, Form tutor" },
];

function LanguageSection({ profile, canEdit, onSaved }: { profile: OperatingProfile; canEdit: boolean; onSaved: () => void }) {
  // Re-mount on every new answer so the form starts from what was saved.
  return <LanguageForm key={JSON.stringify(profile)} profile={profile} canEdit={canEdit} onSaved={onSaved} />;
}

function LanguageForm({ profile, canEdit, onSaved }: { profile: OperatingProfile; canEdit: boolean; onSaved: () => void }) {
  const toast = useToast();
  const save = useApiMutation();
  const [preset, setPreset] = useState<Preset>(profile.preset);
  const [labels, setLabels] = useState<Labels>(profile.labels);
  const changed = preset !== profile.preset || LABEL_FIELDS.some(({ key }) => labels[key] !== profile.labels[key]);

  function pickPreset(next: Preset) {
    setPreset(next);
    setLabels(PRESET_LABELS[next]);
    save.clear();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = Object.fromEntries(LABEL_FIELDS.map(({ key }) => [key, labels[key].trim()])) as Labels;
    const sent = await save.send<OperatingProfile>("/v1/school/operating-profile", {
      method: "PUT",
      body: { preset, labels: trimmed },
    });
    if (!sent.ok) return;
    onSaved();
    toast({ title: "School language saved" });
  }

  // Nested validation messages arrive as "labels.period" (or "period").
  const errorFor = (key: LabelKey) => save.fieldErrors[`labels.${key}`] ?? save.fieldErrors[key];
  const fieldNames = ["preset", "labels", ...LABEL_FIELDS.flatMap(({ key }) => [key, `labels.${key}`])];
  const presetInfo = PRESETS.find((item) => item.value === preset);

  return (
    <form onSubmit={submit}>
      <fieldset disabled={!canEdit || save.submitting} className="grid gap-5 sm:grid-cols-2">
        <legend className="sr-only">School language</legend>
        <Field
          label="How the campus is organised"
          htmlFor="preset"
          error={save.fieldErrors.preset}
          help={presetInfo?.description}
          className="sm:col-span-2"
        >
          <Select id="preset" value={preset} onChange={(event) => pickPreset(event.target.value as Preset)}>
            {PRESETS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </Field>
        {LABEL_FIELDS.map(({ key, label, help }) => (
          <Field key={key} label={label} htmlFor={`label-${key}`} help={help} error={errorFor(key)}>
            <Input
              id={`label-${key}`}
              value={labels[key]}
              required
              maxLength={40}
              onChange={(event) => {
                const value = event.target.value;
                setLabels((current) => ({ ...current, [key]: value }));
                save.clear();
              }}
            />
          </Field>
        ))}
        <div className="sm:col-span-2">
          <FormError error={save.error} fields={fieldNames} />
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="submit" disabled={!changed}>
              {save.submitting ? "Saving…" : "Save"}
            </Button>
            {changed && (
              <Button
                variant="outline"
                onClick={() => {
                  setPreset(profile.preset);
                  setLabels(profile.labels);
                  save.clear();
                }}
              >
                Discard changes
              </Button>
            )}
          </div>
        )}
      </fieldset>
      {!canEdit && <p className="mt-4 text-sm text-muted-foreground">You can view these words but not change them.</p>}
    </form>
  );
}

// ---------------------------------------------------------------- 4.4 Features

/** "daily_register" → "Daily register". */
function humanize(key: string): string {
  const words = key.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function FeaturesSection({ features, canEdit, onChanged }: { features: FeatureState[]; canEdit: boolean; onChanged: () => void }) {
  const toast = useToast();
  const change = useApiMutation();
  // The feature being saved, so only its switches wait.
  const [saving, setSaving] = useState<string | null>(null);
  const [turningOff, setTurningOff] = useState<FeatureState | null>(null);

  const groups = useMemo(() => {
    const byGroup = new Map<string, FeatureState[]>();
    for (const feature of features) byGroup.set(feature.group, [...(byGroup.get(feature.group) ?? []), feature]);
    return [...byGroup.entries()];
  }, [features]);

  async function save(feature: FeatureState, body: { enabled: boolean; config?: Record<string, boolean> }, message: string) {
    setSaving(feature.feature);
    const sent = await change.send<FeatureState>(`/v1/school/features/${feature.feature}`, { method: "PUT", body });
    setSaving(null);
    if (!sent.ok) {
      toast({ title: `Could not change ${feature.label}`, description: sent.error.message, tone: "error" });
      return;
    }
    onChanged();
    toast({ title: message });
  }

  function toggle(feature: FeatureState, enabled: boolean) {
    // Switching off hides pages people may be using, so it is confirmed first.
    if (!enabled) setTurningOff(feature);
    else void save(feature, { enabled: true }, `${feature.label} switched on`);
  }

  return (
    <div className="grid gap-6">
      {groups.map(([group, items]) => (
        <div key={group} className="grid gap-1">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{group}</h3>
          <ul className="divide-y rounded-lg border">
            {items.map((feature) => {
              const busy = saving === feature.feature;
              return (
                <li key={feature.feature} className="grid gap-3 px-4 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="grid gap-0.5">
                      <span id={`feature-${feature.feature}`} className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {feature.label}
                        {feature.source === "platform" && <Badge tone="info">Set by the platform</Badge>}
                        {feature.source === "default" && !feature.defaultEnabled && <Badge>Off by default</Badge>}
                      </span>
                      <span className="text-sm text-muted-foreground">{feature.description}</span>
                    </div>
                    <Switch
                      checked={feature.enabled}
                      onCheckedChange={(next) => toggle(feature, next)}
                      disabled={!canEdit || busy}
                      aria-labelledby={`feature-${feature.feature}`}
                      aria-busy={busy}
                    />
                  </div>

                  {feature.enabled && feature.config && Object.keys(feature.config).length > 0 && (
                    <ul className="grid gap-2 border-l-2 pl-4 sm:grid-cols-2" aria-label={`${feature.label} settings`}>
                      {Object.entries(feature.config).map(([key, on]) => (
                        <li key={key} className="flex items-center justify-between gap-3 text-sm">
                          <span id={`feature-${feature.feature}-${key}`}>{humanize(key)}</span>
                          <Switch
                            size="sm"
                            checked={on}
                            disabled={!canEdit || busy}
                            aria-labelledby={`feature-${feature.feature}-${key}`}
                            onCheckedChange={(next) =>
                              void save(
                                feature,
                                { enabled: true, config: { [key]: next } },
                                `${humanize(key)} ${next ? "shown" : "hidden"}`,
                              )
                            }
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {!canEdit && <p className="text-sm text-muted-foreground">You can see which features are on but not change them.</p>}

      <ConfirmDialog
        open={turningOff !== null}
        onClose={() => setTurningOff(null)}
        onConfirm={() => {
          if (turningOff) void save(turningOff, { enabled: false }, `${turningOff.label} switched off`);
        }}
        title={`Switch off ${turningOff?.label ?? "this feature"}?`}
        description="Its pages close for everyone at this campus. Nothing is deleted: switching it back on brings everything back."
        confirmLabel="Switch off"
      />
    </div>
  );
}

// ---------------------------------------------------------------- Day to day

const AREAS = [
  { label: "Students", description: "Admission numbers, record statuses and promotion rules.", href: "/students" },
  { label: "Parents and guardians", description: "Who can see a learner's results and invoices.", href: "/parents" },
  { label: "Fees and payments", description: "Fee categories, payment methods and late fees.", href: "/fee-categories" },
  { label: "Notices", description: "Who may publish and how notices are emailed.", href: "/notices" },
  { label: "Staff access", description: "Roles and what each one may do.", href: "/roles" },
  { label: "Timetables", description: "Periods, breaks and the school week.", href: "/timetables" },
];

function QuickLinks() {
  return (
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
  );
}
