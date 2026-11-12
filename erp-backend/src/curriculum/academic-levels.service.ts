import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, In, Not } from 'typeorm';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { TransactionService } from '../common/database/transaction.service.js';
import { postgresCode } from '../common/errors/error-response.js';
import { RuleViolation } from '../common/errors/api-exception.js';
import { findInSchool, newInSchool } from '../common/tenancy/school-scope.js';
import { type CampusTerms, campusTerms } from './campus-terms.js';
import {
  LEVEL_SUBJECT,
  STATUS_LABELS,
  type StructureStatus,
  canMoveStructure,
} from './curriculum.constants.js';
import { AcademicCycleSection } from './entities/academic-cycle-section.entity.js';
import { AcademicLevel } from './entities/academic-level.entity.js';
import { CourseOffering } from './entities/course-offering.entity.js';
import { InstructionalModelException } from './entities/instructional-model-exception.entity.js';

export const LEVEL_NOT_FOUND = 'Academic level not found.';

export const LevelMessages = {
  nameTaken: 'This school already has a level with that name.',
  codeTaken: 'This school already has a level with that short code.',
  groupHasParent: 'A level group must be a top-level group without a parent.',
  parentNotListed: 'Choose one of the listed level groups.',
  archived: (t: CampusTerms) => `An archived ${t.class} cannot be edited.`,
  hasSections: 'This level has sections, so it cannot become a level group.',
  hasSectionOfferings:
    'This level has subjects taught by section or to named learners, so it cannot become a level group.',
  hasChildren:
    'Move the child levels first before marking this group as a teachable level.',
  underItself: 'A level cannot sit under itself.',
  descendant: 'That level group sits under this one already.',
  cannotBecome: (from: StructureStatus, to: StructureStatus, t: CampusTerms) =>
    `A ${STATUS_LABELS[from]} ${t.class} cannot become ${STATUS_LABELS[to]}.`,
  sectionsRunning: (count: number, t: CampusTerms) =>
    `Archive the ${count} draft or active ${t.sections} of this ${t.class} first.`,
  deleteChildren:
    'Move the child levels first before deleting this level group.',
  deleteSections:
    'This level has year sections. Keep it for history instead of deleting it.',
  deleteOfferings:
    'This level has subjects attached to it. Keep it for history instead of deleting it.',
  deleteExceptions:
    'This level has teaching setup attached to it. Keep it for history instead of deleting it.',
} as const;

export interface LevelInput {
  name?: string;
  code?: string | null;
  parentId?: string | null;
  position?: number;
  isGroup?: boolean;
}

// The levels (classes, grades) of a campus (reference CreateAcademicLevel,
// UpdateAcademicLevel, ChangeAcademicLevelStatus, DeleteAcademicLevel,
// MoveAcademicLevel, AcademicLevelForm).
@Injectable()
export class AcademicLevels {
  constructor(
    private readonly dataSource: DataSource,
    private readonly transactions: TransactionService,
    private readonly audit: AuditService,
  ) {}

  list(schoolId: string, status?: StructureStatus): Promise<AcademicLevel[]> {
    return this.dataSource.manager.find(AcademicLevel, {
      where: { schoolId, ...(status ? { status } : {}) },
      order: { position: 'ASC', name: 'ASC', id: 'ASC' },
    });
  }

  find(
    manager: EntityManager,
    schoolId: string,
    id: string,
    lock = false,
  ): Promise<AcademicLevel> {
    return findInSchool(
      manager,
      AcademicLevel,
      { id },
      { schoolId, lock, notFound: LEVEL_NOT_FOUND },
    );
  }

  async create(schoolId: string, input: LevelInput): Promise<AcademicLevel> {
    const isGroup = input.isGroup ?? false;
    const name = input.name!.trim();
    const code = input.code?.trim() || null;
    return this.unique(() =>
      this.transactions.run(async (tx) => {
        const manager = tx.manager;
        const parentId = input.parentId ?? null;
        if (isGroup && parentId) {
          throw new RuleViolation(LevelMessages.groupHasParent, {
            parentId: [LevelMessages.groupHasParent],
          });
        }
        if (parentId) await this.mustBeListedGroup(manager, schoolId, parentId);
        await this.refuseTaken(manager, schoolId, name, code);
        const level = await manager.save(
          newInSchool(
            manager,
            AcademicLevel,
            {
              parentId,
              isGroup,
              name,
              code,
              position: input.position ?? 0,
              status: 'active',
            },
            { schoolId },
          ),
        );
        await this.audit.record(manager, {
          action: AuditAction.AcademicLevelCreated,
          subject: { type: LEVEL_SUBJECT, id: level.id },
          context: { parent_id: parentId, is_group: isGroup, code },
          schoolId,
        });
        return level;
      }),
    );
  }

  async update(
    schoolId: string,
    id: string,
    input: LevelInput,
  ): Promise<AcademicLevel> {
    const name = input.name?.trim();
    const code =
      input.code === undefined ? undefined : input.code?.trim() || null;
    return this.unique(() =>
      this.transactions.run(async (tx) => {
        const manager = tx.manager;
        const level = await this.find(manager, schoolId, id, true);
        const terms = await campusTerms(manager, schoolId);
        if (level.status === 'archived') {
          throw new RuleViolation(LevelMessages.archived(terms));
        }
        const isGroup = input.isGroup ?? level.isGroup;
        const parentId =
          input.parentId === undefined ? level.parentId : input.parentId;
        await this.refuseMisfit(manager, level, parentId, isGroup);
        if (parentId && parentId !== level.parentId) {
          await this.mustBeListedGroup(manager, schoolId, parentId, level.id);
        }

        const before = this.readable(level);
        Object.assign(level, {
          name: name ?? level.name,
          code: code === undefined ? level.code : code,
          position: input.position ?? level.position,
          parentId,
          isGroup,
        });
        const after = this.readable(level);
        if (JSON.stringify(before) === JSON.stringify(after)) return level;
        await this.refuseTaken(
          manager,
          schoolId,
          name && name !== before.name ? name : null,
          code !== undefined && code !== before.code ? code : null,
          level.id,
        );
        const saved = await manager.save(level);
        await this.audit.record(manager, {
          action: AuditAction.AcademicLevelUpdated,
          subject: { type: LEVEL_SUBJECT, id: level.id },
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
  ): Promise<AcademicLevel> {
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const level = await this.find(manager, schoolId, id, true);
      if (level.status === status) return level;
      const terms = await campusTerms(manager, schoolId);
      const from = level.status;
      if (!canMoveStructure(from, status)) {
        throw new RuleViolation(
          LevelMessages.cannotBecome(from, status, terms),
        );
      }
      if (status === 'archived') {
        const running = await manager.count(AcademicCycleSection, {
          where: { academicLevelId: level.id, status: In(['draft', 'active']) },
        });
        if (running > 0) {
          throw new RuleViolation(
            LevelMessages.sectionsRunning(running, terms),
          );
        }
      }
      level.status = status;
      const saved = await manager.save(level);
      await this.audit.record(manager, {
        action: AuditAction.AcademicLevelStatusChanged,
        subject: { type: LEVEL_SUBJECT, id: level.id },
        context: { from, to: status },
        schoolId,
      });
      return saved;
    });
  }

  // Only an unused level goes; one in use is kept for history.
  async delete(schoolId: string, id: string): Promise<void> {
    await this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const level = await this.find(manager, schoolId, id, true);
      if (await manager.exists(AcademicLevel, { where: { parentId: id } })) {
        throw new RuleViolation(LevelMessages.deleteChildren);
      }
      if (
        await manager.exists(AcademicCycleSection, {
          where: { academicLevelId: id },
        })
      ) {
        throw new RuleViolation(LevelMessages.deleteSections);
      }
      if (
        await manager.exists(CourseOffering, { where: { academicLevelId: id } })
      ) {
        throw new RuleViolation(LevelMessages.deleteOfferings);
      }
      if (
        await manager.exists(InstructionalModelException, {
          where: { academicLevelId: id },
        })
      ) {
        throw new RuleViolation(LevelMessages.deleteExceptions);
      }
      await manager.delete(AcademicLevel, { id });
      await this.audit.record(manager, {
        action: AuditAction.AcademicLevelDeleted,
        subject: { type: LEVEL_SUBJECT, id },
        context: {
          name: level.name,
          code: level.code,
          is_group: level.isGroup,
        },
        schoolId,
      });
    });
  }

  // Swaps a level with its neighbour among the levels sharing its parent and
  // numbers them from 0. False when there is nowhere to move.
  async move(
    schoolId: string,
    id: string,
    direction: 'up' | 'down',
  ): Promise<boolean> {
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const level = await this.find(manager, schoolId, id);
      const siblings = await manager
        .createQueryBuilder(AcademicLevel, 'level')
        .where('level.schoolId = :schoolId', { schoolId })
        .andWhere(
          level.parentId
            ? 'level.parentId = :parentId'
            : 'level.parentId IS NULL',
          { parentId: level.parentId },
        )
        .orderBy('level.position', 'ASC')
        .addOrderBy('level.name', 'ASC')
        .addOrderBy('level.id', 'ASC')
        .setLock('pessimistic_write')
        .getMany();
      return reorder(siblings, id, direction, async (sibling, from) => {
        await manager.update(AcademicLevel, sibling.id, {
          position: sibling.position,
        });
        await this.audit.record(manager, {
          action: AuditAction.AcademicLevelUpdated,
          subject: { type: LEVEL_SUBJECT, id: sibling.id },
          context: { position: { from, to: sibling.position } },
          schoolId,
        });
      });
    });
  }

  // This level and every level below it (AcademicLevel::teachingScopeIds):
  // a whole-group offering reaches the learners of every child level.
  async teachingScopeIds(
    manager: EntityManager,
    levelId: string,
  ): Promise<string[]> {
    const rows = (await manager.query(
      `WITH RECURSIVE scope(id) AS (
         SELECT $1::uuid
         UNION
         SELECT level.id FROM academic_levels level JOIN scope ON level.parent_id = scope.id
       )
       SELECT id FROM scope`,
      [levelId],
    )) as Array<{ id: string }>;
    return rows.map((row) => row.id);
  }

  // A parent must be an active level group of the campus, unless it is
  // the level's parent already (AcademicLevelForm::parentOptions).
  private async mustBeListedGroup(
    manager: EntityManager,
    schoolId: string,
    parentId: string,
    selfId?: string,
  ): Promise<void> {
    const listed =
      parentId !== selfId &&
      (await manager.exists(AcademicLevel, {
        where: { id: parentId, schoolId, isGroup: true, status: 'active' },
      }));
    if (!listed) {
      throw new RuleViolation(LevelMessages.parentNotListed, {
        parentId: [LevelMessages.parentNotListed],
      });
    }
  }

  private async refuseMisfit(
    manager: EntityManager,
    level: AcademicLevel,
    parentId: string | null,
    isGroup: boolean,
  ): Promise<void> {
    if (isGroup && parentId) {
      throw new RuleViolation(LevelMessages.groupHasParent);
    }
    if (isGroup && !level.isGroup) {
      if (
        await manager.exists(AcademicCycleSection, {
          where: { academicLevelId: level.id },
        })
      ) {
        throw new RuleViolation(LevelMessages.hasSections);
      }
      if (
        await manager.exists(CourseOffering, {
          where: {
            academicLevelId: level.id,
            rosterMode: Not('academic_level'),
          },
        })
      ) {
        throw new RuleViolation(LevelMessages.hasSectionOfferings);
      }
    }
    if (
      !isGroup &&
      (await manager.exists(AcademicLevel, { where: { parentId: level.id } }))
    ) {
      throw new RuleViolation(LevelMessages.hasChildren);
    }
    if (parentId) {
      if (parentId === level.id) {
        throw new RuleViolation(LevelMessages.underItself);
      }
      const below = await this.teachingScopeIds(manager, level.id);
      if (below.includes(parentId)) {
        throw new RuleViolation(LevelMessages.descendant);
      }
    }
  }

  private async refuseTaken(
    manager: EntityManager,
    schoolId: string,
    name: string | null,
    code: string | null,
    ignoreId?: string,
  ): Promise<void> {
    const taken = async (column: 'name' | 'code', value: string) =>
      manager
        .createQueryBuilder(AcademicLevel, 'level')
        .where('level.schoolId = :schoolId', { schoolId })
        .andWhere(`lower(level.${column}) = lower(:value)`, { value })
        .andWhere(ignoreId ? 'level.id <> :ignoreId' : '1 = 1', { ignoreId })
        .getExists();
    if (name && (await taken('name', name))) {
      throw new RuleViolation(LevelMessages.nameTaken, {
        name: [LevelMessages.nameTaken],
      });
    }
    if (code && (await taken('code', code))) {
      throw new RuleViolation(LevelMessages.codeTaken, {
        code: [LevelMessages.codeTaken],
      });
    }
  }

  // Two requests racing for one name or code: the unique index decides.
  private async unique<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (postgresCode(error) !== '23505') throw error;
      const constraint =
        (error as { driverError?: { constraint?: string } }).driverError
          ?.constraint ?? '';
      const field = constraint.includes('code') ? 'code' : 'name';
      const message =
        field === 'code' ? LevelMessages.codeTaken : LevelMessages.nameTaken;
      throw new RuleViolation(message, { [field]: [message] });
    }
  }

  private readable(level: AcademicLevel) {
    return {
      name: level.name,
      code: level.code,
      position: level.position,
      parent_id: level.parentId,
      is_group: level.isGroup,
    };
  }
}

// Swaps one row with its neighbour and numbers the list from 0, calling
// `save` for each row whose position changed (MoveAcademicLevel,
// MoveAcademicCycleSection).
export async function reorder<T extends { id: string; position: number }>(
  rows: T[],
  id: string,
  direction: 'up' | 'down',
  save: (row: T, from: number) => Promise<void>,
): Promise<boolean> {
  const index = rows.findIndex((row) => row.id === id);
  if (index === -1) return false;
  const swap = direction === 'up' ? index - 1 : index + 1;
  if (swap < 0 || swap >= rows.length) return false;
  const ordered = [...rows];
  [ordered[index], ordered[swap]] = [ordered[swap], ordered[index]];
  let changed = false;
  for (const [position, row] of ordered.entries()) {
    if (row.position === position) continue;
    const from = row.position;
    row.position = position;
    await save(row, from);
    changed = true;
  }
  return changed;
}
