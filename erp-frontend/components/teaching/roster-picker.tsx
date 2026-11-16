"use client";

import { useSections } from "@/components/academic/lookups";
import { LookupError } from "@/components/ui/api-states";
import { Field, Select } from "@/components/ui/form";
import { withQuery, type Paginated } from "@/lib/api";
import { ROSTER_MODES, type RosterMode } from "@/lib/academic";
import { sectionRule, teachingApi, type Student } from "@/lib/teaching";
import { useApiQuery } from "@/lib/use-api";

export type RosterValue = { mode: RosterMode; sectionIds: string[]; studentIds: string[] };

/** Why a roster is not complete yet, or null when it is. */
export function rosterProblem(value: RosterValue): string | null {
  const rule = sectionRule(value.mode);
  if (rule && value.sectionIds.length < rule.min) {
    return rule.min === 1 ? "Choose the section it teaches." : "Choose at least two sections to combine.";
  }
  if (value.mode === "individual_roster" && value.studentIds.length === 0) return "Choose at least one learner.";
  return null;
}

/** The request fields for a roster (UpdateRosterDto / CreateOfferingDto). */
export function rosterBody(value: RosterValue) {
  return {
    rosterMode: value.mode,
    ...(sectionRule(value.mode) ? { academicCycleSectionIds: value.sectionIds } : {}),
    ...(value.mode === "individual_roster" ? { studentRecordIds: value.studentIds } : {}),
  };
}

/**
 * Who an offering teaches: one section, several combined, the whole class, or
 * named learners of that class this year. `allowedModes` marks the modes the
 * year's teaching model accepts without an exception; the others stay
 * offered, and the backend refuses them unless an exception exists.
 */
export function RosterPicker({
  yearId,
  levelId,
  value,
  onChange,
  allowedModes,
  errors = {},
  idPrefix = "roster",
}: {
  yearId: string;
  levelId: string;
  value: RosterValue;
  onChange: (value: RosterValue) => void;
  allowedModes?: RosterMode[];
  errors?: Record<string, string>;
  idPrefix?: string;
}) {
  const rule = sectionRule(value.mode);
  const ready = Boolean(yearId && levelId);
  const { query: sectionQuery, sections } = useSections(ready && rule ? yearId : null, levelId);
  const usable = sections.filter((section) => section.status !== "archived");
  const learners = useApiQuery<Paginated<Student>>(
    ready && value.mode === "individual_roster"
      ? withQuery(teachingApi.students, { academicYearId: yearId, academicLevelId: levelId, status: "active", perPage: 100 })
      : null,
  );

  const toggle = (list: string[], id: string, on: boolean, max = Infinity) =>
    on ? (max === 1 ? [id] : [...list, id].slice(0, max)) : list.filter((item) => item !== id);

  return (
    <div className="grid gap-4">
      <Field
        label="Who it teaches"
        htmlFor={`${idPrefix}-mode`}
        error={errors.rosterMode}
        help={
          allowedModes && !allowedModes.includes(value.mode)
            ? "The year's teaching model refuses this roster unless the subject has an exception."
            : undefined
        }
      >
        <Select
          id={`${idPrefix}-mode`}
          value={value.mode}
          onChange={(event) => onChange({ mode: event.target.value as RosterMode, sectionIds: [], studentIds: [] })}
        >
          {ROSTER_MODES.map((mode) => (
            <option key={mode.value} value={mode.value}>
              {mode.label}
              {allowedModes && !allowedModes.includes(mode.value) ? " (needs an exception)" : ""}
            </option>
          ))}
        </Select>
      </Field>

      <LookupError queries={[sectionQuery, learners]} />
      {!ready && rule && <p className="text-sm text-muted-foreground">Choose the year and class first.</p>}

      {ready && rule && (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm text-muted-foreground">
            {rule.max === 1 ? "Section" : "Sections to combine"}
          </legend>
          {sectionQuery.loading && sections.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading sections…</p>
          ) : usable.length === 0 ? (
            <p className="text-sm text-muted-foreground">This class has no sections in that year yet.</p>
          ) : (
            <div className="grid gap-1 sm:grid-cols-3">
              {usable.map((section) => (
                <label key={section.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40">
                  <input
                    type={rule.max === 1 ? "radio" : "checkbox"}
                    name={`${idPrefix}-sections`}
                    className="size-4"
                    checked={value.sectionIds.includes(section.id)}
                    onChange={(event) => onChange({ ...value, sectionIds: toggle(value.sectionIds, section.id, event.target.checked, rule.max) })}
                  />
                  {section.name}
                  {section.status === "draft" && <span className="text-xs text-muted-foreground">(draft)</span>}
                </label>
              ))}
            </div>
          )}
          {errors.academicCycleSectionIds && <p className="text-sm text-destructive">{errors.academicCycleSectionIds}</p>}
        </fieldset>
      )}

      {ready && value.mode === "individual_roster" && (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm text-muted-foreground">
            Learners ({value.studentIds.length} chosen) — active learners of this class this year
          </legend>
          {learners.loading ? (
            <p className="text-sm text-muted-foreground">Loading learners…</p>
          ) : (learners.data?.data.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No active learners in this class this year.</p>
          ) : (
            <div className="grid max-h-64 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
              {learners.data?.data.map((student) => (
                <label key={student.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={value.studentIds.includes(student.id)}
                    onChange={(event) => onChange({ ...value, studentIds: toggle(value.studentIds, student.id, event.target.checked) })}
                  />
                  <span className="min-w-0 truncate">{student.name}</span>
                  <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">{student.admissionNumber}</span>
                </label>
              ))}
            </div>
          )}
          {errors.studentRecordIds && <p className="text-sm text-destructive">{errors.studentRecordIds}</p>}
        </fieldset>
      )}

      {value.mode === "academic_level" && (
        <p className="text-sm text-muted-foreground">Every learner of the class this year, whatever their section.</p>
      )}
    </div>
  );
}
