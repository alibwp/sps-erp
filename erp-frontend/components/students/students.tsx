"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { GraduationCap, Plus, ShieldAlert } from "lucide-react";
import { useCallback, useState, type FormEvent } from "react";
import { useWorkingContext } from "@/components/auth/session";
import { useLevels, useSections, useYears } from "@/components/academic/lookups";
import { Page } from "@/components/layout/page-header";
import { FormError, Loaded, LookupError } from "@/components/ui/api-states";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert, Avatar, EmptyState } from "@/components/ui/misc";
import { Pagination, SearchBox, Table, TD, TH, THead, TR } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { withQuery, type Paginated } from "@/lib/api";
import {
  ENROLLMENT_STATUS_LABELS,
  enrollmentTone,
  GENDERS,
  PERSON_FIELDS,
  teachingApi,
  type EnrollmentStatus,
  type PersonField,
  type Student,
} from "@/lib/teaching";
import { useApiMutation, useApiQuery } from "@/lib/use-api";

// Students as the backend keeps them: an enrollment at the campus, the
// person's account details, and the section they sit in now. The backend has
// no guardian on a student record, so no guardian is shown or asked for.

const PER_PAGE = 20;

export function EnrollmentBadge({ status }: { status: string }) {
  return <Badge tone={enrollmentTone(status)}>{ENROLLMENT_STATUS_LABELS[status as EnrollmentStatus] ?? status}</Badge>;
}

/** "Admit student", for "create student". */
export function AdmitButton() {
  const { can } = useWorkingContext();
  if (!can("create student")) return null;
  return (
    <ButtonLink href="/students/create">
      <Plus /> Admit student
    </ButtonLink>
  );
}

/** /students: learners by year, class, section and status, searchable. */
export function StudentList() {
  const { schoolId, working } = useWorkingContext();
  const [yearId, setYearId] = useState<string | null>(null);
  const [levelId, setLevelId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [status, setStatus] = useState<EnrollmentStatus | "">("active");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const year = yearId ?? working?.academicYear?.id ?? "";
  const { query: yearsQuery, years } = useYears();
  const levels = useLevels();
  const { query: sectionsQuery, sections } = useSections(year || null, levelId || undefined);

  const students = useApiQuery<Paginated<Student>>(
    schoolId
      ? withQuery(teachingApi.students, {
          page,
          perPage: PER_PAGE,
          search,
          status,
          academicYearId: year,
          academicLevelId: levelId,
          academicCycleSectionId: sectionId,
        })
      : null,
    { keepPrevious: true },
  );

  const onSearch = useCallback((text: string) => {
    setSearch(text);
    setPage(1);
  }, []);
  const filter = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    setPage(1);
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <SearchBox label="Search by name or admission no." onSearch={onSearch} className="max-w-72" />
        <label className="flex items-center gap-2">
          Year
          <Select
            className="h-9 w-36"
            value={year}
            onChange={(event) => {
              filter(setYearId)(event.target.value);
              setSectionId("");
            }}
          >
            <option value="">Every year</option>
            {years.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex items-center gap-2">
          Class
          <Select
            className="h-9 w-40"
            value={levelId}
            onChange={(event) => {
              filter(setLevelId)(event.target.value);
              setSectionId("");
            }}
          >
            <option value="">Every class</option>
            {levels.teachable.map((level) => (
              <option key={level.id} value={level.id}>
                {level.name}
              </option>
            ))}
          </Select>
        </label>
        {year && (
          <label className="flex items-center gap-2">
            Section
            <Select className="h-9 w-36" value={sectionId} onChange={(event) => filter(setSectionId)(event.target.value)}>
              <option value="">Every section</option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {levelId ? section.name : `${levels.name.get(section.academicLevelId) ?? ""} ${section.name}`.trim()}
                </option>
              ))}
            </Select>
          </label>
        )}
        <label className="flex items-center gap-2">
          Status
          <Select className="h-9 w-36" value={status} onChange={(event) => filter(setStatus)(event.target.value as EnrollmentStatus | "")}>
            <option value="">Every status</option>
            {(Object.keys(ENROLLMENT_STATUS_LABELS) as EnrollmentStatus[]).map((value) => (
              <option key={value} value={value}>
                {ENROLLMENT_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </label>
      </div>

      <LookupError queries={[yearsQuery, levels.query, sectionsQuery]} />

      <Loaded query={students}>
        {({ data, meta }) =>
          data.length === 0 ? (
            <EmptyState
              icon={GraduationCap}
              title={search ? "No student matches" : "No students"}
              description={search ? "Try another name or admission number." : "Admitted learners appear here."}
            />
          ) : (
            <>
              <Table busy={students.loading}>
                <THead>
                  <TH>Student</TH>
                  <TH>Admission no.</TH>
                  <TH>Class and section</TH>
                  <TH>Gender</TH>
                  <TH>Status</TH>
                </THead>
                <tbody>
                  {data.map((student) => (
                    <TR key={student.id}>
                      <TD>
                        <div className="flex items-center gap-3">
                          <Avatar name={student.name} size="sm" />
                          <div className="min-w-0">
                            <Link href={`/students/${student.id}`} className="block font-medium hover:underline hover:underline-offset-4">
                              {student.name}
                            </Link>
                            <span className="block truncate text-xs text-muted-foreground">{student.email}</span>
                          </div>
                        </div>
                      </TD>
                      <TD className="font-mono text-xs">{student.admissionNumber}</TD>
                      <TD>
                        {student.section
                          ? `${levels.name.get(student.section.academicLevelId) ?? ""} · ${student.section.name}`
                          : <span className="text-muted-foreground">Not placed</span>}
                      </TD>
                      <TD>{student.gender ?? "—"}</TD>
                      <TD>
                        <EnrollmentBadge status={student.status} />
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

// ---------------------------------------------------------------- Admit / edit

/** Fields the backend accepts as null; name and email must have a value. */
export const CLEARABLE = new Set<PersonField>(PERSON_FIELDS.filter((field) => field !== "name" && field !== "email"));

/**
 * The person fields of a learner or any account (ProvisionAccountDto): the
 * admit, edit and "add a person" forms share them.
 */
export function PersonFields({
  student,
  errors,
  emailHelp = "A new person gets an email invitation to set their password.",
}: {
  student?: Partial<Record<PersonField, string | null>>;
  errors: Record<string, string>;
  emailHelp?: string;
}) {
  const value = (field: PersonField) => student?.[field] ?? "";
  return (
    <>
      <Field label="Full name" htmlFor="student-name" error={errors.name}>
        <Input id="student-name" name="name" defaultValue={value("name")} required maxLength={100} autoComplete="off" />
      </Field>
      <Field
        label="Email"
        htmlFor="student-email"
        error={errors.email}
        help={student ? undefined : emailHelp}
      >
        <Input id="student-email" name="email" type="email" defaultValue={value("email")} required maxLength={100} autoComplete="off" />
      </Field>
      <Field label="Date of birth" htmlFor="student-birthday" error={errors.birthday}>
        <Input id="student-birthday" name="birthday" type="date" defaultValue={value("birthday")} />
      </Field>
      <Field label="Gender" htmlFor="student-gender" error={errors.gender}>
        <Select id="student-gender" name="gender" defaultValue={value("gender")}>
          <option value="">Not set</option>
          {GENDERS.map((gender) => (
            <option key={gender} value={gender}>
              {gender}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Phone" htmlFor="student-phone" error={errors.phone}>
        <Input id="student-phone" name="phone" type="tel" defaultValue={value("phone")} maxLength={100} />
      </Field>
      <Field label="Nationality" htmlFor="student-nationality" error={errors.nationality}>
        <Input id="student-nationality" name="nationality" defaultValue={value("nationality")} maxLength={100} />
      </Field>
      <Field label="Address" htmlFor="student-address" error={errors.address} className="sm:col-span-2">
        <Input id="student-address" name="address" defaultValue={value("address")} maxLength={255} />
      </Field>
      <Field label="Address line 2" htmlFor="student-address2" error={errors.addressLine2} className="sm:col-span-2">
        <Input id="student-address2" name="addressLine2" defaultValue={value("addressLine2")} maxLength={255} />
      </Field>
      <Field label="City" htmlFor="student-city" error={errors.city}>
        <Input id="student-city" name="city" defaultValue={value("city")} maxLength={100} />
      </Field>
      <Field label="State / province" htmlFor="student-state" error={errors.state}>
        <Input id="student-state" name="state" defaultValue={value("state")} maxLength={100} />
      </Field>
      <Field label="Postal code" htmlFor="student-postal" error={errors.postalCode}>
        <Input id="student-postal" name="postalCode" defaultValue={value("postalCode")} maxLength={30} />
      </Field>
      <Field label="Country" htmlFor="student-country" error={errors.country}>
        <Input id="student-country" name="country" defaultValue={value("country")} maxLength={100} />
      </Field>
    </>
  );
}

/**
 * /students/create: POST /v1/students. Provisions the account, gives the
 * student role, opens the enrollment and places the learner in an active
 * section of the working school year.
 */
export function AdmitStudent() {
  const router = useRouter();
  const toast = useToast();
  const { ready, can, working } = useWorkingContext();
  const save = useApiMutation();
  const yearId = working?.academicYear?.id ?? null;
  const levels = useLevels();
  const { query: sectionQuery, sections } = useSections(yearId, undefined, "active");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "").trim();
    const body: Record<string, string | null> = {};
    for (const field of PERSON_FIELDS) body[field] = CLEARABLE.has(field) ? text(field) || null : text(field);
    body.academicCycleSectionId = text("academicCycleSectionId");
    body.admissionNumber = text("admissionNumber") || null;
    if (text("admissionDate")) body.admissionDate = text("admissionDate");

    const sent = await save.send<Student>(teachingApi.students, { method: "POST", body });
    if (!sent.ok) return;
    toast({ title: `${sent.data.name} admitted`, description: `Admission number ${sent.data.admissionNumber}.` });
    router.push(`/students/${sent.data.id}`);
  }

  const errors = save.fieldErrors;

  return (
    <Page title="Admit student" breadcrumbs={[{ label: "Students", href: "/students" }, { label: "Admit student" }]}>
      {ready && !can("create student") ? (
        <Alert tone="warning" icon={ShieldAlert} title="You cannot admit students">
          Admitting a learner needs the “create student” permission.
        </Alert>
      ) : !yearId ? (
        <Alert tone="warning" title="No working school year">
          A learner is placed in a section of the working school year. Publish a school year first.
        </Alert>
      ) : (
        <form onSubmit={submit} onChange={save.clear} className="grid max-w-3xl gap-8">
          <fieldset disabled={save.submitting} className="grid gap-5 sm:grid-cols-2">
            <legend className="mb-4 text-lg font-medium">Personal details</legend>
            <PersonFields errors={errors} />
          </fieldset>
          <LookupError queries={[levels.query, sectionQuery]} />
          <fieldset disabled={save.submitting} className="grid gap-5 sm:grid-cols-2">
            <legend className="mb-4 text-lg font-medium">Admission · {working?.academicYear?.name}</legend>
            <Field
              label="Section"
              htmlFor="student-section"
              error={errors.academicCycleSectionId}
              help={!sectionQuery.loading && sections.length === 0 ? "No active section in the working year yet." : undefined}
              className="sm:col-span-2"
            >
              <Select id="student-section" name="academicCycleSectionId" required defaultValue="">
                <option value="" disabled>
                  Choose a section
                </option>
                {levels.teachable.map((level) => {
                  const ofLevel = sections.filter((section) => section.academicLevelId === level.id);
                  if (ofLevel.length === 0) return null;
                  return (
                    <optgroup key={level.id} label={level.name}>
                      {ofLevel.map((section) => (
                        <option key={section.id} value={section.id}>
                          {level.name} · {section.name}
                          {section.capacity ? ` (capacity ${section.capacity})` : ""}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </Select>
            </Field>
            <Field label="Admission number" htmlFor="student-admission" error={errors.admissionNumber} help="Made for you when left blank.">
              <Input id="student-admission" name="admissionNumber" maxLength={100} className="font-mono" />
            </Field>
            <Field label="Date of admission" htmlFor="student-admitted" error={errors.admissionDate} help="Defaults to today; never later.">
              <Input id="student-admitted" name="admissionDate" type="date" />
            </Field>
          </fieldset>
          <FormError error={save.error} fields={[...PERSON_FIELDS, "academicCycleSectionId", "admissionNumber", "admissionDate"]} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={save.submitting}>
              {save.submitting ? "Admitting…" : "Admit learner"}
            </Button>
            <ButtonLink href="/students" variant="outline">
              Cancel
            </ButtonLink>
          </div>
        </form>
      )}
    </Page>
  );
}

/** /students/[id]/edit: PATCH /v1/students/:id with only the fields changed. */
export function EditStudent({ id }: { id: string }) {
  const student = useApiQuery<Student>(teachingApi.student(id));
  const name = student.data?.name ?? "Student";
  return (
    <Page
      title={`Edit ${name}`}
      breadcrumbs={[{ label: "Students", href: "/students" }, { label: name, href: `/students/${id}` }, { label: "Edit" }]}
    >
      <Loaded query={student}>{(data) => <EditForm student={data} />}</Loaded>
    </Page>
  );
}

function EditForm({ student }: { student: Student }) {
  const router = useRouter();
  const toast = useToast();
  const { ready, can } = useWorkingContext();
  const save = useApiMutation();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body: Partial<Record<PersonField, string | null>> = {};
    for (const field of PERSON_FIELDS) {
      const next = String(form.get(field) ?? "").trim();
      if (next === (student[field] ?? "")) continue;
      body[field] = next === "" && CLEARABLE.has(field) ? null : next;
    }
    if (Object.keys(body).length === 0) {
      router.push(`/students/${student.id}`);
      return;
    }
    const sent = await save.send<Student>(teachingApi.student(student.id), { method: "PATCH", body });
    if (!sent.ok) return;
    toast({ title: "Student saved", description: sent.data.name });
    router.push(`/students/${student.id}`);
  }

  if (ready && !can("update student")) {
    return (
      <Alert tone="warning" icon={ShieldAlert} title="You cannot edit students">
        Changing a learner&apos;s details needs the “update student” permission.
      </Alert>
    );
  }

  return (
    <form onSubmit={submit} onChange={save.clear} className="grid max-w-3xl gap-6">
      <fieldset disabled={save.submitting} className="grid gap-5 sm:grid-cols-2">
        <legend className="sr-only">Personal details</legend>
        <PersonFields student={student} errors={save.fieldErrors} />
      </fieldset>
      <p className="text-sm text-muted-foreground">
        The email of someone who belongs to another campus, or holds more access than you, can only be changed by them.
      </p>
      <FormError error={save.error} fields={PERSON_FIELDS} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={save.submitting}>
          {save.submitting ? "Saving…" : "Save changes"}
        </Button>
        <ButtonLink href={`/students/${student.id}`} variant="outline">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}
