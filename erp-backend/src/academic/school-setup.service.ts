import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { Clock } from '../common/clock/clock.js';
import { TransactionService } from '../common/database/transaction.service.js';
import { RuleViolation } from '../common/errors/api-exception.js';
import { findInSchool } from '../common/tenancy/school-scope.js';
import { SchoolOperatingProfile } from '../organizations/entities/school-operating-profile.entity.js';
import { School } from '../organizations/entities/school.entity.js';
import {
  SCHOOL_SETUP_STEPS,
  type SetupPhaseStatus,
  YEAR_SETUP_STEPS,
} from './academic.constants.js';
import { AcademicPeriodContext } from './academic-period-context.service.js';
import { AcademicPeriod } from './entities/academic-period.entity.js';
import { AcademicYear } from './entities/academic-year.entity.js';
import { SchoolSetupPhase } from './entities/school-setup-phase.entity.js';
import { InstructionalModels } from './instructional-models.service.js';

// Counts later stages provide: classes (non-group academic levels) and the
// year's sections and course offerings (Stage 4), active students (Stage
// 5), grading scales (Stage 10). Until a stage registers its count, the
// count is 0 and its step is not done.
export type SetupCountKey =
  | 'academic_levels'
  | 'cycle_sections'
  | 'course_offerings'
  | 'students'
  | 'grading_scales';

export type SetupCount = (
  manager: EntityManager,
  school: School,
  year: AcademicYear | null,
) => Promise<number>;

export interface SetupStep {
  value: string;
  label: string;
  description: string;
  complete: boolean;
  required: boolean;
}

export interface Progress {
  steps: SetupStep[];
  current: string;
}

export interface ChecklistItem {
  key: string;
  title: string;
  description: string;
  reason: string;
  complete: boolean;
  required: boolean;
  group: string;
}

export interface SchoolSetupState {
  progress: Progress;
  academicYearId: string | null;
  counts: Record<string, number>;
  items: ChecklistItem[];
  completed: number;
  total: number;
  requiredRemaining: number;
  next: string | null;
  phase: {
    key: string;
    status: SetupPhaseStatus;
    completedAt: Date | null;
    acknowledgedAt: Date | null;
    acknowledgedById: string | null;
  };
  showReadyNotice: boolean;
}

export const PHASE_VERSION = 1;
export const SETUP_NOT_READY =
  'The setup is not ready to acknowledge. Finish the required steps first.';

function lower(text: string): string {
  return text.toLowerCase();
}
function plural(text: string): string {
  return /(s|x|ch|sh)$/i.test(text) ? `${text}es` : `${text}s`;
}
function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// The campus setup (reference SchoolSetupProgress, SchoolSetupChecklist,
// SchoolSetupPhaseService) and the setup of one year
// (AcademicYearSetupProgress). Everything is worked out from the records;
// only the phase is stored.
@Injectable()
export class SchoolSetup {
  private readonly counts = new Map<SetupCountKey, SetupCount>();

  constructor(
    private readonly dataSource: DataSource,
    private readonly transactions: TransactionService,
    private readonly context: AcademicPeriodContext,
    private readonly models: InstructionalModels,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  registerCount(key: SetupCountKey, count: SetupCount): void {
    this.counts.set(key, count);
  }

  async forSchool(
    userId: string,
    school: School,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<SchoolSetupState> {
    const working = await this.context.resolve(
      userId,
      school,
      undefined,
      manager,
    );
    const year = working.academicYear;
    const profile = await manager.findOne(SchoolOperatingProfile, {
      where: { schoolId: school.id },
    });
    const labels = profile?.labels ?? {};
    const yearLabel = lower(labels.academic_year ?? 'School year');
    const periodsLabel = plural(lower(labels.period ?? 'term'));
    const classLabel = lower(labels.class_level ?? 'Class');
    const classesLabel = plural(classLabel);
    const sectionsLabel = plural(lower(labels.section ?? 'section'));

    const counts = {
      academicLevels: await this.count(
        'academic_levels',
        manager,
        school,
        year,
      ),
      academicPeriods: 0,
      cycleSections: year
        ? await this.count('cycle_sections', manager, school, year)
        : 0,
      courseOfferings: year
        ? await this.count('course_offerings', manager, school, year)
        : 0,
      gradingScales: await this.count('grading_scales', manager, school, year),
      teachers: await this.teachers(manager, school.id),
      students: await this.count('students', manager, school, year),
    };
    counts.academicPeriods = year
      ? await manager
          .createQueryBuilder(AcademicPeriod, 'period')
          .where('period.academicYearId = :yearId', { yearId: year.id })
          .andWhere('period.parentId IS NULL')
          .getCount()
      : 0;

    const detailsComplete = this.detailsComplete(school);
    const today = this.clock.schoolToday(school.timezone);
    // A year that has started keeps the approach it runs with, so there is
    // nothing left to answer.
    const teachingSettled =
      year !== null &&
      ((await this.models.settingFor(manager, year)) !== null ||
        !this.models.isFutureCycle(year, today));

    const items: ChecklistItem[] = [
      {
        key: 'school_details',
        title: 'School details',
        description:
          'Keep the school name and address ready for staff, families and printed records.',
        reason: detailsComplete
          ? ''
          : 'Complete the school name and address before using printed records and communications.',
        complete: detailsComplete,
        required: true,
        group: 'School basics',
      },
      {
        key: 'academic_year',
        title: `Current ${yearLabel}`,
        description: `Choose the ${yearLabel} that this request and the setup work belong to.`,
        reason: year ? '' : `No current ${yearLabel} is selected.`,
        complete: year !== null,
        required: true,
        group: 'Prepare the year',
      },
      {
        key: 'academic_periods',
        title: `${capitalize(periodsLabel)} or reporting periods`,
        description: `Divide the ${yearLabel} into the terms, semesters or reporting periods your school uses.`,
        reason: !year
          ? `Choose a current ${yearLabel} first, then add its terms or reporting periods.`
          : counts.academicPeriods === 0
            ? `No terms or reporting periods have been added for the current ${yearLabel}.`
            : '',
        complete: year !== null && counts.academicPeriods > 0,
        required: true,
        group: 'Prepare the year',
      },
      {
        key: 'instructional_model',
        title: 'Teaching approach',
        description:
          'Say whether learners stay together or move between subject classes.',
        reason: !year
          ? 'Choose a current school year first, then select the teaching approach for it.'
          : teachingSettled
            ? ''
            : 'No teaching approach has been chosen for the current school year.',
        complete: teachingSettled,
        required: true,
        group: 'Prepare the year',
      },
      {
        key: 'academic_levels',
        title: capitalize(classesLabel),
        description: `Create the reusable grades or ${classesLabel} your school teaches.`,
        reason:
          counts.academicLevels === 0
            ? `No ${classesLabel} have been added yet.`
            : '',
        complete: counts.academicLevels > 0,
        required: true,
        group: 'Build the teaching structure',
      },
      {
        key: 'cycle_sections',
        title: `${capitalize(sectionsLabel)} for this year`,
        description: `Create the arms, homerooms or ${sectionsLabel} that run in the current ${yearLabel}.`,
        reason: !year
          ? `Choose a current ${yearLabel} first, then create its ${sectionsLabel}.`
          : counts.cycleSections === 0
            ? `No ${sectionsLabel} have been created for the current ${yearLabel}.`
            : '',
        complete: year !== null && counts.cycleSections > 0,
        required: true,
        group: 'Build the teaching structure',
      },
      {
        key: 'course_offerings',
        title: 'Subjects being taught',
        description: `Choose the subjects each grade or ${classLabel} will study and assign their teaching structure.`,
        reason: !year
          ? 'Choose a current school year first, then set up the subjects being taught.'
          : counts.courseOfferings === 0
            ? 'No subjects have been set up for the current school year.'
            : '',
        complete: year !== null && counts.courseOfferings > 0,
        required: true,
        group: 'Build the teaching structure',
      },
      {
        key: 'grading_scales',
        title: 'Grading scales',
        description:
          'Give teachers the grade names and options they use when marking work.',
        reason:
          counts.gradingScales === 0
            ? 'No grading scale has been configured yet.'
            : '',
        complete: counts.gradingScales > 0,
        required: false,
        group: 'Recommended next steps',
      },
      {
        key: 'staff_access',
        title: 'Staff access',
        description:
          'Invite or create the staff accounts that need to work in this school.',
        reason:
          counts.teachers === 0 ? 'No teacher account has been added yet.' : '',
        complete: counts.teachers > 0,
        required: false,
        group: 'Recommended next steps',
      },
      {
        key: 'student_records',
        title: 'Student records',
        description:
          'Add learners so classes, attendance, communication and reporting have people to work with.',
        reason:
          counts.students === 0
            ? 'No active student record has been added yet.'
            : '',
        complete: counts.students > 0,
        required: false,
        group: 'Recommended next steps',
      },
    ];
    const requiredRemaining = items.filter(
      (item) => item.required && !item.complete,
    ).length;
    const next =
      items.find((item) => item.required && !item.complete) ??
      items.find((item) => !item.complete) ??
      null;

    const phase = await this.reconcilePhase(
      manager,
      school.id,
      year,
      requiredRemaining === 0,
    );
    return {
      progress: await this.schoolProgress(
        manager,
        school,
        counts.academicLevels,
        detailsComplete,
      ),
      academicYearId: year?.id ?? null,
      counts,
      items,
      completed: items.filter((item) => item.complete).length,
      total: items.length,
      requiredRemaining,
      next: next?.key ?? null,
      phase: {
        key: phase.phaseKey,
        status: phase.status,
        completedAt: phase.completedAt,
        acknowledgedAt: phase.acknowledgedAt,
        acknowledgedById: phase.acknowledgedById,
      },
      showReadyNotice: phase.status === 'ready',
    };
  }

  // Confirms a ready setup; the dashboard stops showing it.
  async acknowledge(userId: string, school: School): Promise<SchoolSetupState> {
    await this.transactions.run(async (tx) => {
      const state = await this.forSchool(userId, school, tx.manager);
      if (state.phase.status !== 'ready') {
        throw new RuleViolation(SETUP_NOT_READY);
      }
      const phase = await tx.manager.findOneOrFail(SchoolSetupPhase, {
        where: { schoolId: school.id, phaseKey: state.phase.key },
        lock: { mode: 'pessimistic_write' },
      });
      phase.status = 'acknowledged';
      phase.acknowledgedAt = this.clock.now();
      phase.acknowledgedById = userId;
      await tx.manager.save(phase);
      await this.audit.record(tx.manager, {
        action: AuditAction.SchoolSetupAcknowledged,
        subject: { type: 'school_setup_phase', id: phase.id },
        context: {
          phase_key: phase.phaseKey,
          academic_year_id: phase.academicYearId,
        },
        schoolId: school.id,
      });
    });
    return this.forSchool(userId, school);
  }

  async forYear(
    schoolId: string,
    yearId: string,
  ): Promise<Progress & { academicYearId: string }> {
    const manager = this.dataSource.manager;
    const year = await findInSchool(
      manager,
      AcademicYear,
      { id: yearId },
      { schoolId, notFound: 'Academic year not found.' },
    );
    const school = await manager.findOneOrFail(School, {
      where: { id: schoolId },
    });
    const topLevel = await manager
      .createQueryBuilder(AcademicPeriod, 'period')
      .where('period.academicYearId = :yearId', { yearId: year.id })
      .andWhere('period.parentId IS NULL')
      .getExists();
    const completion: Record<string, boolean> = {
      calendar: year.startsOn !== null && year.endsOn !== null && topLevel,
      teaching: (await this.models.settingFor(manager, year)) !== null,
      structure:
        (await this.count('academic_levels', manager, school, year)) > 0 &&
        (await this.count('cycle_sections', manager, school, year)) > 0,
      subjects:
        (await this.count('course_offerings', manager, school, year)) > 0,
      review: year.status !== 'draft',
    };
    const steps = YEAR_SETUP_STEPS.map((step) => ({
      value: step.value,
      label: step.label,
      description: step.description,
      complete: completion[step.value],
      required: step.value !== 'review',
    }));
    return {
      academicYearId: year.id,
      steps,
      current: steps.find((step) => !step.complete)?.value ?? 'review',
    };
  }

  private async schoolProgress(
    manager: EntityManager,
    school: School,
    academicLevels: number,
    detailsComplete: boolean,
  ): Promise<Progress> {
    const completion: Record<string, boolean> = {
      details: detailsComplete,
      language: await manager
        .createQueryBuilder(SchoolOperatingProfile, 'profile')
        .where('profile.schoolId = :schoolId', { schoolId: school.id })
        .andWhere('profile.setupCompletedAt IS NOT NULL')
        .getExists(),
      classes: academicLevels > 0,
      'academic-year': await manager.exists(AcademicYear, {
        where: { schoolId: school.id },
      }),
      finish: false,
    };
    const steps = SCHOOL_SETUP_STEPS.map((step) => ({
      value: step.value,
      label: step.label,
      description: step.description,
      complete: completion[step.value],
      required: step.value !== 'finish',
    }));
    return {
      steps,
      current: steps.find((step) => !step.complete)?.value ?? 'finish',
    };
  }

  // The phase of the working year: back to in progress while anything
  // required is missing, ready once nothing is.
  private async reconcilePhase(
    manager: EntityManager,
    schoolId: string,
    year: AcademicYear | null,
    complete: boolean,
  ): Promise<SchoolSetupPhase> {
    const phaseKey = `daily-work-v${PHASE_VERSION}:academic-year-${year?.id ?? 'none'}`;
    await manager.query(
      `INSERT INTO school_setup_phases (school_id, academic_year_id, phase_key, status)
       VALUES ($1, $2, $3, 'in_progress')
       ON CONFLICT ON CONSTRAINT school_setup_phases_school_phase_unique DO NOTHING`,
      [schoolId, year?.id ?? null, phaseKey],
    );
    const phase = await manager.findOneOrFail(SchoolSetupPhase, {
      where: { schoolId, phaseKey },
    });
    if (!complete) {
      if (
        phase.status !== 'in_progress' ||
        phase.completedAt ||
        phase.acknowledgedAt ||
        phase.acknowledgedById
      ) {
        Object.assign(phase, {
          status: 'in_progress',
          completedAt: null,
          acknowledgedAt: null,
          acknowledgedById: null,
        });
        return manager.save(phase);
      }
      return phase;
    }
    if (phase.status === 'in_progress') {
      phase.status = 'ready';
      phase.completedAt = this.clock.now();
      return manager.save(phase);
    }
    return phase;
  }

  // Reference SchoolSetupProgress::detailsComplete.
  private detailsComplete(school: School): boolean {
    return (
      school.setupDetailsCompletedAt !== null &&
      Boolean(school.name) &&
      Boolean(school.address) &&
      Boolean(school.country) &&
      Boolean(school.state) &&
      Boolean(school.city) &&
      Boolean(school.postalCode)
    );
  }

  // Active members of the campus holding the teacher role there.
  private async teachers(
    manager: EntityManager,
    schoolId: string,
  ): Promise<number> {
    const [{ count }] = (await manager.query(
      `SELECT count(DISTINCT a.user_id)::int AS count
         FROM model_has_roles a
         JOIN roles r ON r.id = a.role_id AND r.school_id IS NULL AND r.name = 'teacher'
         JOIN school_memberships m
           ON m.user_id = a.user_id AND m.school_id = a.school_id AND m.status = 'active'
        WHERE a.school_id = $1`,
      [schoolId],
    )) as Array<{ count: number }>;
    return count;
  }

  private async count(
    key: SetupCountKey,
    manager: EntityManager,
    school: School,
    year: AcademicYear | null,
  ): Promise<number> {
    const count = this.counts.get(key);
    return count ? count(manager, school, year) : 0;
  }
}
