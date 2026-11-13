import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { isFrozen } from '../academic/academic.constants.js';
import { AcademicYear } from '../academic/entities/academic-year.entity.js';
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
import { reorder } from './academic-levels.service.js';
import { type CampusTerms, campusTerms, withArticle } from './campus-terms.js';
import {
  SECTION_SUBJECT,
  STATUS_LABELS,
  type StructureStatus,
  canMoveStructure,
} from './curriculum.constants.js';
import { AcademicCycleSection } from './entities/academic-cycle-section.entity.js';
import { AcademicLevel } from './entities/academic-level.entity.js';
import { teacherStanding } from './teachers.js';

export const SECTION_NOT_FOUND = 'Section not found.';

export const SectionMessages = {
  groupLevel:
    'A level group organizes teachable levels. Add this section under one of its child levels.',
  levelNotActive: (t: CampusTerms) =>
    `Choose an active ${t.class} for this ${t.section}.`,
  yearClosedCreate:
    'The academic cycle is closed. Reopen it before configuring sections.',
  yearClosedEdit:
    'The academic cycle is closed. Reopen it before editing a section.',
  yearClosedActivate:
    'The academic cycle is closed. Reopen it before activating a section.',
  teacherElsewhere: (t: CampusTerms) =>
    `The ${t.homeroomTeacher} does not work in this school.`,
  notTeacher: (t: CampusTerms) =>
    `Only a teacher can be ${withArticle(t.homeroomTeacher)}.`,
  archived: (t: CampusTerms) => `An archived ${t.section} cannot be edited.`,
  capacityBelowSeats: (taken: number) =>
    `${taken} seats are taken in this section now, counting open waitlist offers. Set a capacity of at least ${taken}.`,
  cannotBecome: (from: StructureStatus, to: StructureStatus, t: CampusTerms) =>
    `A ${STATUS_LABELS[from]} ${t.section} cannot become ${STATUS_LABELS[to]}.`,
  nameTaken:
    'This class already has a section with this name in this school year. Choose another name.',
  rollSameYear: 'Choose a different academic cycle to receive the sections.',
  rollTargetClosed: 'The target academic cycle is closed.',
} as const;

// What later stages know about a section: Stage 5 refuses archiving a
// section with placed learners or open waitlist entries, and counts the
// seats taken when its capacity is lowered.
export interface SectionUsage {
  archiveRefusal?(
    manager: EntityManager,
    section: AcademicCycleSection,
    terms: CampusTerms,
  ): Promise<string | null>;
  seatsTaken?(
    manager: EntityManager,
    section: AcademicCycleSection,
  ): Promise<number>;
}

export interface SectionDetails {
  name?: string;
  label?: string | null;
  stream?: string | null;
  shift?: string | null;
  language?: string | null;
  room?: string | null;
  capacity?: number | null;
  position?: number;
  homeroomTeacherId?: string | null;
}

export interface SectionListQuery {
  page: number;
  perPage: number;
  sort?: string;
  search?: string;
  academicYearId?: string;
  academicLevelId?: string;
  status?: StructureStatus;
}

export interface SectionRollForwardPreview {
  copies: AcademicCycleSection[];
  skips: AcademicCycleSection[];
  leftBehind: AcademicCycleSection[];
}

const DETAIL_FIELDS = [
  'name',
  'label',
  'stream',
  'shift',
  'language',
  'room',
  'capacity',
  'position',
  'homeroomTeacherId',
] as const;

// The sections of each level in each school year (reference
// CreateAcademicCycleSection, UpdateAcademicCycleSection,
// ChangeAcademicCycleSectionStatus, MoveAcademicCycleSection,
// RollForwardAcademicCycleSections). Sections are archived, never deleted.
@Injectable()
export class CycleSections {
  private readonly usages: SectionUsage[] = [];

  constructor(
    private readonly dataSource: DataSource,
    private readonly transactions: TransactionService,
    private readonly audit: AuditService,
  ) {}

  registerUsage(usage: SectionUsage): void {
    this.usages.push(usage);
  }

  list(
    schoolId: string,
    query: SectionListQuery,
  ): Promise<Paginated<AcademicCycleSection>> {
    const qb = inSchool(
      this.dataSource.manager.createQueryBuilder(
        AcademicCycleSection,
        'section',
      ),
      { schoolId },
    );
    if (query.academicYearId) {
      qb.andWhere('section.academicYearId = :yearId', {
        yearId: query.academicYearId,
      });
    }
    if (query.academicLevelId) {
      qb.andWhere('section.academicLevelId = :levelId', {
        levelId: query.academicLevelId,
      });
    }
    if (query.status) {
      qb.andWhere('section.status = :status', { status: query.status });
    }
    if (query.search) {
      qb.andWhere('section.name ILIKE :search', {
        search: `%${query.search.replace(/[\\%_]/g, '')}%`,
      });
    }
    return paginate(
      qb,
      { page: query.page, perPage: query.perPage, sort: query.sort },
      {
        name: 'section.name',
        position: 'section.position',
        status: 'section.status',
        createdAt: 'section.createdAt',
      },
      [
        { column: 'section.position', direction: 'ASC' },
        { column: 'section.name', direction: 'ASC' },
      ],
    );
  }

  find(
    manager: EntityManager,
    schoolId: string,
    id: string,
    lock = false,
  ): Promise<AcademicCycleSection> {
    return findInSchool(
      manager,
      AcademicCycleSection,
      { id },
      { schoolId, lock, notFound: SECTION_NOT_FOUND },
    );
  }

  async create(
    schoolId: string,
    academicYearId: string,
    academicLevelId: string,
    details: SectionDetails,
  ): Promise<AcademicCycleSection> {
    return this.unique(() =>
      this.transactions.run(async (tx) => {
        const manager = tx.manager;
        const terms = await campusTerms(manager, schoolId);
        const year = await findInSchool(
          manager,
          AcademicYear,
          { id: academicYearId },
          { schoolId, notFound: 'Academic year not found.' },
        );
        const level = await findInSchool(
          manager,
          AcademicLevel,
          { id: academicLevelId },
          { schoolId, notFound: 'Academic level not found.' },
        );
        if (level.isGroup) throw new RuleViolation(SectionMessages.groupLevel);
        if (level.status !== 'active') {
          throw new RuleViolation(SectionMessages.levelNotActive(terms));
        }
        if (isFrozen(year.status)) {
          throw new RuleViolation(SectionMessages.yearClosedCreate);
        }
        if (details.homeroomTeacherId) {
          await this.mustBeTeacher(
            manager,
            schoolId,
            details.homeroomTeacherId,
            terms,
          );
        }
        const name = details.name!.trim();
        await this.refuseTaken(manager, schoolId, year.id, level.id, name);
        const section = await manager.save(
          newInSchool(
            manager,
            AcademicCycleSection,
            {
              academicYearId: year.id,
              academicLevelId: level.id,
              homeroomTeacherId: details.homeroomTeacherId ?? null,
              name,
              label: details.label ?? null,
              stream: details.stream ?? null,
              shift: details.shift ?? null,
              language: details.language ?? null,
              room: details.room ?? null,
              capacity: details.capacity ?? null,
              position: details.position ?? 0,
              status: 'draft',
            },
            { schoolId },
          ),
        );
        await this.audit.record(manager, {
          action: AuditAction.AcademicCycleSectionCreated,
          subject: { type: SECTION_SUBJECT, id: section.id },
          context: {
            academic_year_id: year.id,
            academic_level_id: level.id,
            homeroom_teacher_id: section.homeroomTeacherId,
          },
          schoolId,
        });
        return section;
      }),
    );
  }

  async update(
    schoolId: string,
    id: string,
    details: SectionDetails,
  ): Promise<AcademicCycleSection> {
    return this.unique(() =>
      this.transactions.run(async (tx) => {
        const manager = tx.manager;
        const terms = await campusTerms(manager, schoolId);
        const section = await this.find(manager, schoolId, id, true);
        if (section.status === 'archived') {
          throw new RuleViolation(SectionMessages.archived(terms));
        }
        const year = await manager.findOneOrFail(AcademicYear, {
          where: { id: section.academicYearId },
        });
        if (isFrozen(year.status)) {
          throw new RuleViolation(SectionMessages.yearClosedEdit);
        }
        if (
          details.homeroomTeacherId &&
          details.homeroomTeacherId !== section.homeroomTeacherId
        ) {
          await this.mustBeTeacher(
            manager,
            schoolId,
            details.homeroomTeacherId,
            terms,
          );
        }
        if (details.capacity !== undefined && details.capacity !== null) {
          const taken = await this.seatsTaken(manager, section);
          if (details.capacity < taken) {
            const message = SectionMessages.capacityBelowSeats(taken);
            throw new RuleViolation(message, { capacity: [message] });
          }
        }

        const before = this.readable(section);
        for (const field of DETAIL_FIELDS) {
          if (details[field] === undefined) continue;
          (section as unknown as Record<string, unknown>)[field] =
            field === 'name' ? details.name!.trim() : details[field];
        }
        const after = this.readable(section);
        if (JSON.stringify(before) === JSON.stringify(after)) return section;
        if (after.name !== before.name) {
          await this.refuseTaken(
            manager,
            schoolId,
            section.academicYearId,
            section.academicLevelId,
            section.name,
            section.id,
          );
        }
        const saved = await manager.save(section);
        await this.audit.record(manager, {
          action: AuditAction.AcademicCycleSectionUpdated,
          subject: { type: SECTION_SUBJECT, id: section.id },
          context: { from: before, to: after },
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
  ): Promise<AcademicCycleSection> {
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const section = await this.find(manager, schoolId, id, true);
      if (section.status === status) return section;
      const terms = await campusTerms(manager, schoolId);
      const from = section.status;
      if (!canMoveStructure(from, status)) {
        throw new RuleViolation(
          SectionMessages.cannotBecome(from, status, terms),
        );
      }
      const year = await manager.findOneOrFail(AcademicYear, {
        where: { id: section.academicYearId },
      });
      if (status === 'active' && isFrozen(year.status)) {
        throw new RuleViolation(SectionMessages.yearClosedActivate);
      }
      if (status === 'archived') {
        for (const usage of this.usages) {
          const refusal = await usage.archiveRefusal?.(manager, section, terms);
          if (refusal) throw new RuleViolation(refusal);
        }
      }
      section.status = status;
      const saved = await manager.save(section);
      await this.audit.record(manager, {
        action: AuditAction.AcademicCycleSectionStatusChanged,
        subject: { type: SECTION_SUBJECT, id: section.id },
        context: { from, to: status },
        schoolId,
      });
      return saved;
    });
  }

  // Swaps a section with its neighbour among its level's sections that
  // year. False for an archived section, a closed year, or no neighbour.
  async move(
    schoolId: string,
    id: string,
    direction: 'up' | 'down',
  ): Promise<boolean> {
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const section = await this.find(manager, schoolId, id, true);
      const year = await manager.findOneOrFail(AcademicYear, {
        where: { id: section.academicYearId },
      });
      if (section.status === 'archived' || isFrozen(year.status)) return false;
      const siblings = await manager.find(AcademicCycleSection, {
        where: {
          schoolId,
          academicYearId: section.academicYearId,
          academicLevelId: section.academicLevelId,
        },
        order: { position: 'ASC', name: 'ASC', id: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });
      return reorder(siblings, id, direction, async (sibling, from) => {
        await manager.update(AcademicCycleSection, sibling.id, {
          position: sibling.position,
        });
        await this.audit.record(manager, {
          action: AuditAction.AcademicCycleSectionUpdated,
          subject: { type: SECTION_SUBJECT, id: sibling.id },
          context: { position: { from, to: sibling.position } },
          schoolId,
        });
      });
    });
  }

  async seatsTaken(
    manager: EntityManager,
    section: AcademicCycleSection,
  ): Promise<number> {
    let taken = 0;
    for (const usage of this.usages) {
      taken += (await usage.seatsTaken?.(manager, section)) ?? 0;
    }
    return taken;
  }

  // What a roll-forward would copy: sections of active, teachable levels
  // that are not archived and that the target year does not have by name.
  async previewRollForward(
    schoolId: string,
    targetId: string,
    sourceId: string,
  ): Promise<SectionRollForwardPreview> {
    const manager = this.dataSource.manager;
    const { source, target } = await this.years(
      manager,
      schoolId,
      targetId,
      sourceId,
    );
    const preview: SectionRollForwardPreview = {
      copies: [],
      skips: [],
      leftBehind: [],
    };
    for (const { section, level } of await this.sectionsOf(manager, source)) {
      if (!this.canCarryForward(section, level)) {
        preview.leftBehind.push(section);
      } else if (await this.targetHas(manager, target, section)) {
        preview.skips.push(section);
      } else {
        preview.copies.push(section);
      }
    }
    return preview;
  }

  async rollForward(
    schoolId: string,
    targetId: string,
    sourceId: string,
  ): Promise<AcademicCycleSection[]> {
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const { source, target } = await this.years(
        manager,
        schoolId,
        targetId,
        sourceId,
        true,
      );
      if (isFrozen(target.status)) {
        throw new RuleViolation(SectionMessages.rollTargetClosed);
      }
      const created: AcademicCycleSection[] = [];
      for (const { section, level } of await this.sectionsOf(manager, source)) {
        if (
          !this.canCarryForward(section, level) ||
          (await this.targetHas(manager, target, section))
        ) {
          continue;
        }
        created.push(
          await manager.save(
            newInSchool(
              manager,
              AcademicCycleSection,
              {
                academicYearId: target.id,
                academicLevelId: section.academicLevelId,
                name: section.name,
                label: section.label,
                stream: section.stream,
                shift: section.shift,
                language: section.language,
                room: section.room,
                capacity: section.capacity,
                position: section.position,
                status: 'draft',
              },
              { schoolId },
            ),
          ),
        );
      }
      if (created.length) {
        await this.audit.record(manager, {
          action: AuditAction.AcademicCycleSectionsRolledForward,
          subject: { type: 'academic_year', id: target.id },
          context: {
            source_academic_year_id: source.id,
            target_academic_year_id: target.id,
            academic_cycle_section_ids: created.map((section) => section.id),
          },
          schoolId,
        });
      }
      return created;
    });
  }

  private async years(
    manager: EntityManager,
    schoolId: string,
    targetId: string,
    sourceId: string,
    lock = false,
  ): Promise<{ source: AcademicYear; target: AcademicYear }> {
    if (targetId === sourceId) {
      throw new RuleViolation(SectionMessages.rollSameYear);
    }
    const target = await findInSchool(
      manager,
      AcademicYear,
      { id: targetId },
      { schoolId, lock, notFound: 'Academic year not found.' },
    );
    const source = await findInSchool(
      manager,
      AcademicYear,
      { id: sourceId },
      { schoolId, notFound: 'Academic year not found.' },
    );
    return { source, target };
  }

  private async sectionsOf(
    manager: EntityManager,
    year: AcademicYear,
  ): Promise<Array<{ section: AcademicCycleSection; level: AcademicLevel }>> {
    const sections = await manager.find(AcademicCycleSection, {
      where: { academicYearId: year.id },
      relations: { academicLevel: true },
      order: { position: 'ASC', createdAt: 'ASC', id: 'ASC' },
    });
    return sections.map((section) => ({
      section,
      level: section.academicLevel,
    }));
  }

  private canCarryForward(
    section: AcademicCycleSection,
    level: AcademicLevel,
  ): boolean {
    return (
      section.status !== 'archived' &&
      level.status === 'active' &&
      !level.isGroup
    );
  }

  private targetHas(
    manager: EntityManager,
    target: AcademicYear,
    section: AcademicCycleSection,
  ): Promise<boolean> {
    return manager
      .createQueryBuilder(AcademicCycleSection, 'section')
      .where('section.academicYearId = :yearId', { yearId: target.id })
      .andWhere('section.academicLevelId = :levelId', {
        levelId: section.academicLevelId,
      })
      .andWhere('lower(section.name) = lower(:name)', { name: section.name })
      .getExists();
  }

  private async mustBeTeacher(
    manager: EntityManager,
    schoolId: string,
    userId: string,
    terms: CampusTerms,
  ): Promise<void> {
    const standing = await teacherStanding(manager, schoolId, userId);
    const fields = (message: string) => ({ homeroomTeacherId: [message] });
    if (!standing.worksHere) {
      const message = SectionMessages.teacherElsewhere(terms);
      throw new RuleViolation(message, fields(message));
    }
    if (!standing.isTeacher) {
      const message = SectionMessages.notTeacher(terms);
      throw new RuleViolation(message, fields(message));
    }
  }

  private async refuseTaken(
    manager: EntityManager,
    schoolId: string,
    yearId: string,
    levelId: string,
    name: string,
    ignoreId?: string,
  ): Promise<void> {
    const taken = await manager
      .createQueryBuilder(AcademicCycleSection, 'section')
      .where('section.schoolId = :schoolId', { schoolId })
      .andWhere('section.academicYearId = :yearId', { yearId })
      .andWhere('section.academicLevelId = :levelId', { levelId })
      .andWhere('lower(section.name) = lower(:name)', { name })
      .andWhere(ignoreId ? 'section.id <> :ignoreId' : '1 = 1', { ignoreId })
      .getExists();
    if (taken) {
      throw new RuleViolation(SectionMessages.nameTaken, {
        name: [SectionMessages.nameTaken],
      });
    }
  }

  private async unique<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (postgresCode(error) !== '23505') throw error;
      throw new RuleViolation(SectionMessages.nameTaken, {
        name: [SectionMessages.nameTaken],
      });
    }
  }

  private readable(section: AcademicCycleSection) {
    return {
      name: section.name,
      label: section.label,
      stream: section.stream,
      shift: section.shift,
      language: section.language,
      room: section.room,
      capacity: section.capacity,
      position: section.position,
      homeroom_teacher_id: section.homeroomTeacherId,
    };
  }
}
