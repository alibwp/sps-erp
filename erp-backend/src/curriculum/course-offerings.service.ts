import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, In, IsNull, Not } from 'typeorm';
import {
  type RosterMode,
  allowsRosterMode,
  isFrozen,
  isOperational,
} from '../academic/academic.constants.js';
import { AcademicPeriod } from '../academic/entities/academic-period.entity.js';
import { AcademicYear } from '../academic/entities/academic-year.entity.js';
import { InstructionalModels } from '../academic/instructional-models.service.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { TransactionService } from '../common/database/transaction.service.js';
import { postgresCode } from '../common/errors/error-response.js';
import { RuleViolation } from '../common/errors/api-exception.js';
import { type Paginated, paginate } from '../common/pagination/pagination.js';
import {
  findInSchool,
  inSchool,
  newInSchool,
} from '../common/tenancy/school-scope.js';
import { StudentRecord } from '../enrollments/entities/student-record.entity.js';
import { AcademicLevels } from './academic-levels.service.js';
import { type CampusTerms, campusTerms } from './campus-terms.js';
import {
  OFFERING_SUBJECT,
  STATUS_LABELS,
  type StructureStatus,
  TEACHING_PERIOD_TYPES,
  canMoveStructure,
  levelAllowsRosterMode,
  usesHomeSections,
} from './curriculum.constants.js';
import { AcademicCycleSection } from './entities/academic-cycle-section.entity.js';
import { AcademicLevel } from './entities/academic-level.entity.js';
import { CourseOfferingSection } from './entities/course-offering-section.entity.js';
import { CourseOfferingStudentRecord } from './entities/course-offering-student-record.entity.js';
import { CourseOffering } from './entities/course-offering.entity.js';
import { Subject } from './entities/subject.entity.js';
import { OfferingClaims } from './offering-claims.js';
import { OfferingExceptions } from './offering-exceptions.service.js';

export const OFFERING_NOT_FOUND = 'Course offering not found.';

export const OfferingMessages = {
  periodNotInYear: 'The academic period does not belong to the academic year.',
  periodNotTopLevel:
    'A course offering runs for a top-level period of the year.',
  noTeachingPeriods:
    'Add at least one term or semester to the academic year before creating this subject.',
  groupHasNoSections: (t: CampusTerms) =>
    `A level group has no ${t.sections} of its own. Choose the whole group or named learners for this subject.`,
  sectionsMisfit: (t: CampusTerms) =>
    `Every selected ${t.section} must belong to this level and academic cycle.`,
  modelRefusesNew:
    'The teaching setup does not allow this way of choosing learners for the academic cycle. Record an exception for this subject if it is taught differently on purpose.',
  exactlyOne: (t: CampusTerms) => `Select exactly one ${t.section}.`,
  atLeastTwo: (t: CampusTerms) => `Select at least two ${t.sections}.`,
  wholeLevel:
    'A whole-level offering does not select sections or individual learners.',
  namedNoSections: (t: CampusTerms) =>
    `A named-learner roster does not select ${t.sections}.`,
  closedCreate: 'Reopen the academic cycle before creating a course offering.',
  archived: 'An archived course offering cannot be changed.',
  nameTooLong: 'Use a name of 100 characters or fewer.',
  groupHasNoSectionsRoster:
    'A level group has no sections of its own. Choose the whole group or named learners.',
  closedChange:
    'Reopen the academic cycle before changing this course offering.',
  sectionsMisfitRoster:
    'Every selected section must belong to this class and school year.',
  modelRefuses:
    'The teaching setup does not allow this way of choosing learners for the academic cycle.',
  exactlyOneRoster: 'Select exactly one section.',
  atLeastTwoRoster: 'Select at least two sections.',
  namedNoSectionsRoster: 'A named-learner roster does not select sections.',
  activeNeedsLearners:
    'Add at least one named learner before changing an active offering.',
  activeClashRoster:
    'An active offering already exists for this subject, period, class, and roster.',
  cannotMove: (from: StructureStatus, to: StructureStatus) =>
    `A ${STATUS_LABELS[from]} offering cannot move to ${STATUS_LABELS[to]}.`,
  openPeriodFirst:
    'Open the academic period before activating its course offering.',
  activateOne:
    'Select exactly one section before activating this course offering.',
  activateTwo:
    'Select at least two sections before activating this course offering.',
  activateWhole:
    'A whole-level offering cannot have sections or named learners.',
  activateNamed:
    'Add at least one named learner before activating this course offering.',
  activeClash:
    'An active offering already exists for this subject, period, level, and section group.',
  learnersMisfit: (t: CampusTerms) =>
    `Every named learner must actively attend this ${t.class} in this school.`,
  learnersMisfitRoster:
    'Every named learner must actively attend this class in this school.',
  noRoom: (capacity: number) =>
    `This subject has room for ${capacity} learners. Name fewer learners or raise the capacity.`,
  sectionsNameNoLearners: 'A section roster does not name learners.',
} as const;

export interface OfferingInput {
  subjectId: string;
  academicYearId: string;
  // A top-level period of the year, or "all": every teaching period.
  academicPeriodId: string;
  academicLevelId: string;
  rosterMode: RosterMode;
  academicCycleSectionIds?: string[];
  studentRecordIds?: string[];
  plannedPeriodsPerWeek?: number | null;
  capacity?: number | null;
  name?: string | null;
}

export interface BulkLevelInput {
  academicLevelId: string;
  rosterMode: RosterMode;
  academicCycleSectionIds?: string[];
  plannedPeriodsPerWeek?: number | null;
  capacity?: number | null;
}

export interface BulkSkip {
  academicPeriodId: string;
  academicLevelId: string;
  rosterMode: RosterMode;
  academicCycleSectionIds: string[];
  reason: string;
}

export const ALREADY_TAUGHT = 'This subject is already taught here.';

export interface OfferingListQuery {
  page: number;
  perPage: number;
  sort?: string;
  search?: string;
  academicYearId?: string;
  academicPeriodId?: string;
  academicLevelId?: string;
  subjectId?: string;
  status?: StructureStatus;
  rosterMode?: RosterMode;
}

// The key two active offerings may not share
// (CourseOffering::activeKeyForRoster).
export function activeKey(
  offering: Pick<
    CourseOffering,
    | 'schoolId'
    | 'academicPeriodId'
    | 'subjectId'
    | 'academicLevelId'
    | 'rosterMode'
  >,
  sectionIds: string[],
  studentRecordIds: string[],
): string {
  return createHash('sha256')
    .update(
      [
        offering.schoolId,
        offering.academicPeriodId,
        offering.subjectId,
        offering.academicLevelId,
        offering.rosterMode,
        [...sectionIds].sort().join(','),
        [...studentRecordIds].sort().join(','),
      ].join(':'),
    )
    .digest('hex');
}

interface Context {
  subject: Subject;
  year: AcademicYear;
  level: AcademicLevel;
  terms: CampusTerms;
}

// What a school teaches: one subject for one level in one period, with its
// roster (reference CreateCourseOffering, CreateCourseOfferingsForLevels,
// CreateCourseOfferingsForSections, RenameCourseOffering,
// UpdateCourseOfferingRoster, ChangeCourseOfferingStatus). Offerings are
// archived, never deleted.
@Injectable()
export class CourseOfferings {
  constructor(
    private readonly dataSource: DataSource,
    private readonly transactions: TransactionService,
    private readonly models: InstructionalModels,
    private readonly exceptions: OfferingExceptions,
    private readonly levels: AcademicLevels,
    private readonly audit: AuditService,
  ) {}

  list(
    schoolId: string,
    query: OfferingListQuery,
  ): Promise<Paginated<CourseOffering>> {
    const qb = inSchool(
      this.dataSource.manager
        .createQueryBuilder(CourseOffering, 'offering')
        .leftJoinAndSelect('offering.subject', 'subject')
        .withDeleted(),
      { schoolId },
    );
    const filters: Array<[keyof OfferingListQuery, string]> = [
      ['academicYearId', 'offering.academicYearId'],
      ['academicPeriodId', 'offering.academicPeriodId'],
      ['academicLevelId', 'offering.academicLevelId'],
      ['subjectId', 'offering.subjectId'],
      ['status', 'offering.status'],
      ['rosterMode', 'offering.rosterMode'],
    ];
    for (const [field, column] of filters) {
      if (query[field] !== undefined) {
        qb.andWhere(`${column} = :${field}`, { [field]: query[field] });
      }
    }
    if (query.search) {
      qb.andWhere(
        '(subject.name ILIKE :search OR offering.name ILIKE :search)',
        {
          search: `%${query.search.replace(/[\\%_]/g, '')}%`,
        },
      );
    }
    return paginate(
      qb,
      { page: query.page, perPage: query.perPage, sort: query.sort },
      {
        subject: 'subject.name',
        status: 'offering.status',
        createdAt: 'offering.createdAt',
      },
      [
        { column: 'subject.name', direction: 'ASC' },
        { column: 'offering.createdAt', direction: 'ASC' },
      ],
    );
  }

  find(
    manager: EntityManager,
    schoolId: string,
    id: string,
    lock = false,
  ): Promise<CourseOffering> {
    return findInSchool(
      manager,
      CourseOffering,
      { id },
      { schoolId, lock, notFound: OFFERING_NOT_FOUND },
    );
  }

  async sectionIdsOf(
    manager: EntityManager,
    offeringId: string,
  ): Promise<string[]> {
    const rows = await manager.find(CourseOfferingSection, {
      where: { courseOfferingId: offeringId },
    });
    return rows.map((row) => row.academicCycleSectionId);
  }

  // One offering for the chosen period, or one for every teaching period
  // of the year when the period is "all".
  async create(
    schoolId: string,
    input: OfferingInput,
  ): Promise<CourseOffering[]> {
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const context = await this.context(manager, schoolId, input);
      const periods = await this.periodsFor(
        manager,
        schoolId,
        context.year,
        input.academicPeriodId,
      );
      const created: CourseOffering[] = [];
      for (const period of periods) {
        created.push(
          await this.createIn(manager, context, period, {
            rosterMode: input.rosterMode,
            sectionIds: input.academicCycleSectionIds ?? [],
            studentRecordIds: input.studentRecordIds ?? [],
            plannedPeriodsPerWeek: input.plannedPeriodsPerWeek ?? null,
            capacity: input.capacity ?? null,
            name: input.name ?? null,
          }),
        );
      }
      return created;
    });
  }

  // Creates the subject for several levels at once; a home-section roster
  // with several sections makes one offering per section. Anything the
  // year already teaches is skipped and reported.
  async bulk(
    schoolId: string,
    input: {
      subjectId: string;
      academicYearId: string;
      academicPeriodId: string;
      levels: BulkLevelInput[];
    },
  ): Promise<{ created: CourseOffering[]; skipped: BulkSkip[] }> {
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const subject = await this.subject(manager, schoolId, input.subjectId);
      const year = await this.year(manager, schoolId, input.academicYearId);
      const terms = await campusTerms(manager, schoolId);
      const periods = await this.periodsFor(
        manager,
        schoolId,
        year,
        input.academicPeriodId,
      );
      const claims = await this.claimsOf(manager, year.id, subject.id, true);
      const created: CourseOffering[] = [];
      const skipped: BulkSkip[] = [];

      for (const config of input.levels) {
        const level = await this.level(
          manager,
          schoolId,
          config.academicLevelId,
        );
        const context = { subject, year, level, terms };
        const sectionIds = usesHomeSections(config.rosterMode)
          ? (config.academicCycleSectionIds ?? [])
          : [];
        const units =
          config.rosterMode === 'home_section' && sectionIds.length > 1
            ? sectionIds.map((id) => [id])
            : [sectionIds];
        for (const unit of units) {
          for (const period of periods) {
            const key = OfferingClaims.key(subject.id, period.id, level.id);
            if (claims.taken(key, config.rosterMode, unit)) {
              skipped.push({
                academicPeriodId: period.id,
                academicLevelId: level.id,
                rosterMode: config.rosterMode,
                academicCycleSectionIds: unit,
                reason: ALREADY_TAUGHT,
              });
              continue;
            }
            created.push(
              await this.createIn(manager, context, period, {
                rosterMode: config.rosterMode,
                sectionIds: unit,
                studentRecordIds: [],
                plannedPeriodsPerWeek: config.plannedPeriodsPerWeek ?? null,
                capacity: config.capacity ?? null,
                name: null,
              }),
            );
            if (config.rosterMode !== 'individual_roster') {
              claims.add(key, config.rosterMode, unit);
            }
          }
        }
      }
      return { created, skipped };
    });
  }

  // What the year already teaches of one subject (non-archived offerings
  // only, or every offering).
  async claimsOf(
    manager: EntityManager,
    yearId: string,
    subjectId: string | null,
    skipArchived: boolean,
  ): Promise<OfferingClaims> {
    const offerings = await manager.find(CourseOffering, {
      where: {
        academicYearId: yearId,
        ...(subjectId ? { subjectId } : {}),
        ...(skipArchived ? { status: Not('archived' as const) } : {}),
      },
    });
    const sections = offerings.length
      ? await manager.find(CourseOfferingSection, {
          where: { courseOfferingId: In(offerings.map((row) => row.id)) },
        })
      : [];
    const claims = new OfferingClaims();
    for (const offering of offerings) {
      claims.add(
        OfferingClaims.key(
          offering.subjectId,
          offering.academicPeriodId,
          offering.academicLevelId,
        ),
        offering.rosterMode,
        sections
          .filter((row) => row.courseOfferingId === offering.id)
          .map((row) => row.academicCycleSectionId),
      );
    }
    return claims;
  }

  async rename(
    schoolId: string,
    id: string,
    name: string | null,
  ): Promise<CourseOffering> {
    const trimmed = name?.trim() || null;
    if (trimmed !== null && [...trimmed].length > 100) {
      throw new RuleViolation(OfferingMessages.nameTooLong, {
        name: [OfferingMessages.nameTooLong],
      });
    }
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const offering = await this.find(manager, schoolId, id, true);
      if (offering.status === 'archived') {
        throw new RuleViolation(OfferingMessages.archived);
      }
      if (offering.name === trimmed) return offering;
      const previous = offering.name;
      offering.name = trimmed;
      const saved = await manager.save(offering);
      await this.audit.record(manager, {
        action: AuditAction.CourseOfferingRenamed,
        subject: { type: OFFERING_SUBJECT, id: offering.id },
        context: { from: previous, to: trimmed },
        schoolId,
      });
      return saved;
    });
  }

  async updateRoster(
    schoolId: string,
    id: string,
    rosterMode: RosterMode,
    sectionIdsInput: string[],
    studentRecordIdsInput: string[] = [],
  ): Promise<CourseOffering> {
    const sectionIds = [...new Set(sectionIdsInput)];
    const learnerIds = [...new Set(studentRecordIdsInput)];
    return this.activeKeyRace(OfferingMessages.activeClashRoster, () =>
      this.transactions.run(async (tx) => {
        const manager = tx.manager;
        const offering = await this.find(manager, schoolId, id, true);
        if (offering.status === 'archived') {
          throw new RuleViolation(OfferingMessages.archived);
        }
        const level = await manager.findOneOrFail(AcademicLevel, {
          where: { id: offering.academicLevelId },
        });
        if (!levelAllowsRosterMode(level.isGroup, rosterMode)) {
          throw new RuleViolation(OfferingMessages.groupHasNoSectionsRoster);
        }
        const year = await manager.findOneOrFail(AcademicYear, {
          where: { id: offering.academicYearId },
        });
        const period = await manager.findOneOrFail(AcademicPeriod, {
          where: { id: offering.academicPeriodId },
        });
        if (isFrozen(year.status) || isFrozen(period.status)) {
          throw new RuleViolation(OfferingMessages.closedChange);
        }
        const sections = sectionIds.length
          ? await manager.find(AcademicCycleSection, {
              where: {
                id: In(sectionIds),
                schoolId,
                academicYearId: offering.academicYearId,
                academicLevelId: offering.academicLevelId,
                status: Not('archived' as const),
              },
            })
          : [];
        if (sections.length !== sectionIds.length) {
          throw new RuleViolation(OfferingMessages.sectionsMisfitRoster);
        }
        if (
          (await this.attendingLearners(
            manager,
            offering,
            level.id,
            learnerIds,
          )) !== learnerIds.length
        ) {
          throw new RuleViolation(OfferingMessages.learnersMisfitRoster);
        }
        await this.mustBeAllowed(
          manager,
          year,
          offering.subjectId,
          level.id,
          rosterMode,
          OfferingMessages.modelRefuses,
        );
        rosterRule(
          rosterMode,
          sectionIds,
          {
            exactlyOne: OfferingMessages.exactlyOneRoster,
            atLeastTwo: OfferingMessages.atLeastTwoRoster,
            namedNoSections: OfferingMessages.namedNoSectionsRoster,
          },
          learnerIds,
        );
        if (
          rosterMode === 'individual_roster' &&
          offering.status === 'active' &&
          learnerIds.length === 0
        ) {
          throw new RuleViolation(OfferingMessages.activeNeedsLearners);
        }
        if (
          offering.capacity !== null &&
          learnerIds.length > offering.capacity
        ) {
          throw new RuleViolation(OfferingMessages.noRoom(offering.capacity));
        }

        offering.rosterMode = rosterMode;
        offering.activeKey = null;
        if (offering.status === 'active') {
          const key = activeKey(offering, sectionIds, learnerIds);
          if (await this.keyTaken(manager, key, offering.id)) {
            throw new RuleViolation(OfferingMessages.activeClashRoster);
          }
          offering.activeKey = key;
        }
        const saved = await manager.save(offering);
        await this.syncSections(manager, offering.id, sectionIds);
        await this.syncLearners(manager, offering.id, learnerIds);
        await this.audit.record(manager, {
          action: AuditAction.CourseOfferingRosterUpdated,
          subject: { type: OFFERING_SUBJECT, id: offering.id },
          context: {
            roster_mode: rosterMode,
            academic_cycle_section_ids: sectionIds,
            student_record_ids: learnerIds,
          },
          schoolId,
        });
        return saved;
      }),
    );
  }

  async changeStatus(
    schoolId: string,
    id: string,
    status: StructureStatus,
  ): Promise<CourseOffering> {
    return this.activeKeyRace(OfferingMessages.activeClash, () =>
      this.transactions.run(async (tx) => {
        const manager = tx.manager;
        const offering = await this.find(manager, schoolId, id, true);
        if (!canMoveStructure(offering.status, status)) {
          throw new RuleViolation(
            OfferingMessages.cannotMove(offering.status, status),
          );
        }
        let key: string | null = null;
        if (status === 'active') {
          const period = await manager.findOneOrFail(AcademicPeriod, {
            where: { id: offering.academicPeriodId },
          });
          const year = await manager.findOneOrFail(AcademicYear, {
            where: { id: offering.academicYearId },
          });
          if (!isOperational(period.status) || isFrozen(year.status)) {
            throw new RuleViolation(OfferingMessages.openPeriodFirst);
          }
          const sectionIds = await this.sectionIdsOf(manager, offering.id);
          const learnerIds = await this.learnerIdsOf(manager, offering.id);
          rosterReady(
            offering.rosterMode,
            sectionIds.length,
            learnerIds.length,
          );
          key = activeKey(offering, sectionIds, learnerIds);
          if (await this.keyTaken(manager, key, offering.id)) {
            throw new RuleViolation(OfferingMessages.activeClash);
          }
        }
        const from = offering.status;
        offering.status = status;
        offering.activeKey = key;
        const saved = await manager.save(offering);
        await this.audit.record(manager, {
          action: AuditAction.CourseOfferingStatusChanged,
          subject: { type: OFFERING_SUBJECT, id: offering.id },
          context: {
            from,
            to: status,
            academic_period_id: offering.academicPeriodId,
          },
          schoolId,
        });
        return saved;
      }),
    );
  }

  // The checks and the insert for one offering in one period, inside the
  // caller's transaction.
  private async createIn(
    manager: EntityManager,
    context: Context,
    period: AcademicPeriod,
    roster: {
      rosterMode: RosterMode;
      sectionIds: string[];
      studentRecordIds: string[];
      plannedPeriodsPerWeek: number | null;
      capacity: number | null;
      name: string | null;
    },
  ): Promise<CourseOffering> {
    const { subject, year, level, terms } = context;
    const sectionIds = [...new Set(roster.sectionIds)];
    const learnerIds = [...new Set(roster.studentRecordIds)];
    if (period.academicYearId !== year.id) {
      throw new RuleViolation(OfferingMessages.periodNotInYear);
    }
    if (period.parentId !== null) {
      throw new RuleViolation(OfferingMessages.periodNotTopLevel);
    }
    if (!levelAllowsRosterMode(level.isGroup, roster.rosterMode)) {
      throw new RuleViolation(OfferingMessages.groupHasNoSections(terms));
    }
    const sections = sectionIds.length
      ? await manager.find(AcademicCycleSection, {
          where: {
            id: In(sectionIds),
            schoolId: year.schoolId,
            academicYearId: year.id,
            academicLevelId: level.id,
          },
        })
      : [];
    if (sections.length !== sectionIds.length) {
      throw new RuleViolation(OfferingMessages.sectionsMisfit(terms));
    }
    if (
      (await this.attendingLearners(
        manager,
        { schoolId: year.schoolId, academicYearId: year.id },
        level.id,
        learnerIds,
      )) !== learnerIds.length
    ) {
      throw new RuleViolation(OfferingMessages.learnersMisfit(terms));
    }
    await this.mustBeAllowed(
      manager,
      year,
      subject.id,
      level.id,
      roster.rosterMode,
      OfferingMessages.modelRefusesNew,
    );
    rosterRule(
      roster.rosterMode,
      sectionIds,
      {
        exactlyOne: OfferingMessages.exactlyOne(terms),
        atLeastTwo: OfferingMessages.atLeastTwo(terms),
        namedNoSections: OfferingMessages.namedNoSections(terms),
      },
      learnerIds,
    );
    if (isFrozen(year.status) || isFrozen(period.status)) {
      throw new RuleViolation(OfferingMessages.closedCreate);
    }
    if (roster.capacity !== null && learnerIds.length > roster.capacity) {
      throw new RuleViolation(OfferingMessages.noRoom(roster.capacity));
    }
    const name = roster.name?.trim() || null;
    if (name !== null && [...name].length > 100) {
      throw new RuleViolation(OfferingMessages.nameTooLong, {
        name: [OfferingMessages.nameTooLong],
      });
    }

    const offering = await manager.save(
      newInSchool(
        manager,
        CourseOffering,
        {
          academicYearId: year.id,
          academicPeriodId: period.id,
          subjectId: subject.id,
          name,
          academicLevelId: level.id,
          rosterMode: roster.rosterMode,
          plannedPeriodsPerWeek: roster.plannedPeriodsPerWeek,
          capacity: roster.capacity,
          status: 'draft',
        },
        { schoolId: year.schoolId },
      ),
    );
    await this.syncSections(manager, offering.id, sectionIds);
    await this.syncLearners(manager, offering.id, learnerIds);
    await this.audit.record(manager, {
      action: AuditAction.CourseOfferingCreated,
      subject: { type: OFFERING_SUBJECT, id: offering.id },
      context: {
        subject_id: subject.id,
        academic_year_id: year.id,
        academic_period_id: period.id,
        academic_level_id: level.id,
        roster_mode: roster.rosterMode,
        academic_cycle_section_ids: sectionIds,
        student_record_ids: learnerIds,
      },
      schoolId: year.schoolId,
    });
    return offering;
  }

  private async context(
    manager: EntityManager,
    schoolId: string,
    input: Pick<
      OfferingInput,
      'subjectId' | 'academicYearId' | 'academicLevelId'
    >,
  ): Promise<Context> {
    return {
      subject: await this.subject(manager, schoolId, input.subjectId),
      year: await this.year(manager, schoolId, input.academicYearId),
      level: await this.level(manager, schoolId, input.academicLevelId),
      terms: await campusTerms(manager, schoolId),
    };
  }

  // The chosen period, or the year's top-level teaching periods for "all"
  // (CreateCourseOffering::createForAcademicYear).
  private async periodsFor(
    manager: EntityManager,
    schoolId: string,
    year: AcademicYear,
    periodId: string,
  ): Promise<AcademicPeriod[]> {
    if (periodId !== 'all') {
      return [
        await findInSchool(
          manager,
          AcademicPeriod,
          { id: periodId },
          { schoolId, notFound: 'Academic period not found.' },
        ),
      ];
    }
    const periods = await manager.find(AcademicPeriod, {
      where: {
        academicYearId: year.id,
        parentId: IsNull(),
        type: In([...TEACHING_PERIOD_TYPES]),
      },
      order: { position: 'ASC', startsOn: 'ASC', createdAt: 'ASC' },
    });
    if (!periods.length) {
      throw new RuleViolation(OfferingMessages.noTeachingPeriods);
    }
    return periods;
  }

  private async mustBeAllowed(
    manager: EntityManager,
    year: AcademicYear,
    subjectId: string,
    levelId: string,
    mode: RosterMode,
    message: string,
  ): Promise<void> {
    const model = await this.models.modelFor(manager, year);
    if (allowsRosterMode(model, mode)) return;
    if (await this.exceptions.allows(manager, year, subjectId, levelId, mode)) {
      return;
    }
    throw new RuleViolation(message);
  }

  async learnerIdsOf(
    manager: EntityManager,
    offeringId: string,
  ): Promise<string[]> {
    const rows = await manager.find(CourseOfferingStudentRecord, {
      where: { courseOfferingId: offeringId },
    });
    return rows.map((row) => row.studentRecordId);
  }

  // How many of the named learners actively attend the offering's level (or
  // a child level of its group) this year at the campus.
  private async attendingLearners(
    manager: EntityManager,
    offering: Pick<CourseOffering, 'schoolId' | 'academicYearId'>,
    levelId: string,
    learnerIds: string[],
  ): Promise<number> {
    if (!learnerIds.length) return 0;
    const levelIds = await this.levels.teachingScopeIds(manager, levelId);
    return manager
      .createQueryBuilder(StudentRecord, 'enrollment')
      .innerJoin('enrollment.academicCycleSection', 'section')
      .where('enrollment.id IN (:...learnerIds)', { learnerIds })
      .andWhere('enrollment.schoolId = :schoolId', {
        schoolId: offering.schoolId,
      })
      .andWhere("enrollment.status = 'active'")
      .andWhere('section.academicYearId = :yearId', {
        yearId: offering.academicYearId,
      })
      .andWhere('section.academicLevelId IN (:...levelIds)', { levelIds })
      .getCount();
  }

  private async syncLearners(
    manager: EntityManager,
    offeringId: string,
    learnerIds: string[],
  ): Promise<void> {
    await manager.delete(CourseOfferingStudentRecord, {
      courseOfferingId: offeringId,
    });
    if (learnerIds.length) {
      await manager.insert(
        CourseOfferingStudentRecord,
        learnerIds.map((studentRecordId) => ({
          courseOfferingId: offeringId,
          studentRecordId,
        })),
      );
    }
  }

  private async syncSections(
    manager: EntityManager,
    offeringId: string,
    sectionIds: string[],
  ): Promise<void> {
    await manager.delete(CourseOfferingSection, {
      courseOfferingId: offeringId,
    });
    if (sectionIds.length) {
      await manager.insert(
        CourseOfferingSection,
        sectionIds.map((academicCycleSectionId) => ({
          courseOfferingId: offeringId,
          academicCycleSectionId,
        })),
      );
    }
  }

  private keyTaken(
    manager: EntityManager,
    key: string,
    offeringId: string,
  ): Promise<boolean> {
    return manager.exists(CourseOffering, {
      where: { activeKey: key, id: Not(offeringId) },
    });
  }

  // Two activations racing for one key: the unique index lets one through
  // and the other gets the same refusal as when it came second.
  private async activeKeyRace<T>(
    message: string,
    work: () => Promise<T>,
  ): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (postgresCode(error) === '23505') throw new RuleViolation(message);
      throw error;
    }
  }

  private subject(
    manager: EntityManager,
    schoolId: string,
    id: string,
  ): Promise<Subject> {
    return findInSchool(
      manager,
      Subject,
      { id },
      { schoolId, notFound: 'Subject not found.' },
    );
  }

  private year(
    manager: EntityManager,
    schoolId: string,
    id: string,
  ): Promise<AcademicYear> {
    return findInSchool(
      manager,
      AcademicYear,
      { id },
      { schoolId, notFound: 'Academic year not found.' },
    );
  }

  private level(
    manager: EntityManager,
    schoolId: string,
    id: string,
  ): Promise<AcademicLevel> {
    return findInSchool(
      manager,
      AcademicLevel,
      { id },
      { schoolId, notFound: 'Academic level not found.' },
    );
  }
}

// The roster each mode needs when an offering is created or its roster
// changes.
export function rosterRule(
  mode: RosterMode,
  sectionIds: string[],
  messages: { exactlyOne: string; atLeastTwo: string; namedNoSections: string },
  learnerIds: string[] = [],
): void {
  if (usesHomeSections(mode) && learnerIds.length) {
    throw new RuleViolation(OfferingMessages.sectionsNameNoLearners);
  }
  if (mode === 'home_section' && sectionIds.length !== 1) {
    throw new RuleViolation(messages.exactlyOne);
  }
  if (mode === 'combined_home_sections' && sectionIds.length < 2) {
    throw new RuleViolation(messages.atLeastTwo);
  }
  if (mode === 'academic_level' && (sectionIds.length || learnerIds.length)) {
    throw new RuleViolation(OfferingMessages.wholeLevel);
  }
  if (mode === 'individual_roster' && sectionIds.length) {
    throw new RuleViolation(messages.namedNoSections);
  }
}

// The roster an offering needs before it can be activated
// (ChangeCourseOfferingStatus::ensureRosterIsReady).
export function rosterReady(
  mode: RosterMode,
  sectionCount: number,
  learnerCount: number,
): void {
  if (mode === 'home_section' && sectionCount !== 1) {
    throw new RuleViolation(OfferingMessages.activateOne);
  }
  if (mode === 'combined_home_sections' && sectionCount < 2) {
    throw new RuleViolation(OfferingMessages.activateTwo);
  }
  if (mode === 'academic_level' && (sectionCount || learnerCount)) {
    throw new RuleViolation(OfferingMessages.activateWhole);
  }
  if (mode === 'individual_roster' && learnerCount === 0) {
    throw new RuleViolation(OfferingMessages.activateNamed);
  }
}
