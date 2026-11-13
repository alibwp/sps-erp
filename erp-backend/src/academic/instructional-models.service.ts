import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { Clock } from '../common/clock/clock.js';
import { TransactionService } from '../common/database/transaction.service.js';
import { RuleViolation } from '../common/errors/api-exception.js';
import { findInSchool, newInSchool } from '../common/tenancy/school-scope.js';
import { School } from '../organizations/entities/school.entity.js';
import {
  DEFAULT_INSTRUCTIONAL_MODEL,
  INSTRUCTIONAL_MODEL_LABELS,
  type InstructionalModel,
  type RosterMode,
  isFrozen,
  isOperational,
  rosterModesFor,
} from './academic.constants.js';
import { AcademicYear, yearName } from './entities/academic-year.entity.js';
import { InstructionalModelMigration } from './entities/instructional-model-migration.entity.js';
import { InstructionalModelSetting } from './entities/instructional-model-setting.entity.js';

// What a migration would change, counted by the modules that own the
// records (course offerings by roster mode arrive in Stage 4).
export interface MigrationImpact {
  offerings: number;
  offerings_by_roster: Record<string, number>;
  exceptions: number;
  exception_rosters: Record<string, number>;
  [key: string]: unknown;
}

export type ImpactContributor = (
  manager: EntityManager,
  year: AcademicYear,
  model: InstructionalModel,
) => Promise<Partial<MigrationImpact>>;

export interface InstructionalModelView {
  academicYearId: string;
  model: InstructionalModel;
  label: string;
  // false: no choice saved yet, the default applies.
  chosen: boolean;
  rosterModes: RosterMode[];
  // Set directly only before the year starts; migrate once it runs.
  canSet: boolean;
  canMigrate: boolean;
  migrations: Array<{
    id: string;
    fromModel: InstructionalModel | null;
    toModel: InstructionalModel;
    reason: string;
    impact: Record<string, unknown> | null;
    migratedById: string | null;
    createdAt: Date;
  }>;
}

export const ModelMessages = {
  started: (name: string) =>
    `The instructional model of ${name} cannot change here, because the cycle has already started. Choose the model for a cycle that has not started, or move this one with the audited migration workflow.`,
  finished: (name: string) =>
    `${name} is finished, so how it was taught cannot change. Reopen the cycle first if it was closed by mistake.`,
  notStarted: (name: string) =>
    `${name} has not started yet, so choose its model on the teaching setup form instead.`,
  same: (name: string, label: string) =>
    `${name} already teaches with: ${label}`,
  reason: 'Say why this cycle is moving to another model.',
} as const;

export const SETTING_SUBJECT = 'instructional_model_setting';
export const MIGRATION_SUBJECT = 'instructional_model_migration';

// How a campus teaches each year (reference SetInstructionalModel,
// MigrateInstructionalModel, InstructionalModelResolver).
@Injectable()
export class InstructionalModels {
  private readonly contributors: ImpactContributor[] = [];

  constructor(
    private readonly dataSource: DataSource,
    private readonly transactions: TransactionService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  registerImpact(contributor: ImpactContributor): void {
    this.contributors.push(contributor);
  }

  async settingFor(
    manager: EntityManager,
    year: AcademicYear,
  ): Promise<InstructionalModelSetting | null> {
    return manager.findOne(InstructionalModelSetting, {
      where: { schoolId: year.schoolId, academicYearId: year.id },
    });
  }

  async modelFor(
    manager: EntityManager,
    year: AcademicYear,
  ): Promise<InstructionalModel> {
    return (
      (await this.settingFor(manager, year))?.model ??
      DEFAULT_INSTRUCTIONAL_MODEL
    );
  }

  // A year that is neither running nor finished and has not reached its
  // start date in the campus's time zone.
  isFutureCycle(year: AcademicYear, today: string): boolean {
    if (isOperational(year.status) || isFrozen(year.status)) return false;
    return year.startsOn === null || year.startsOn > today;
  }

  async view(
    schoolId: string,
    yearId: string,
  ): Promise<InstructionalModelView> {
    const manager = this.dataSource.manager;
    const year = await this.year(manager, schoolId, yearId);
    const setting = await this.settingFor(manager, year);
    const model = setting?.model ?? DEFAULT_INSTRUCTIONAL_MODEL;
    const today = await this.today(manager, schoolId);
    const migrations = await manager.find(InstructionalModelMigration, {
      where: { schoolId, academicYearId: year.id },
      order: { createdAt: 'DESC' },
    });
    return {
      academicYearId: year.id,
      model,
      label: INSTRUCTIONAL_MODEL_LABELS[model],
      chosen: setting !== null,
      rosterModes: rosterModesFor(model),
      canSet: this.isFutureCycle(year, today),
      canMigrate: isOperational(year.status),
      migrations: migrations.map((row) => ({
        id: row.id,
        fromModel: row.fromModel,
        toModel: row.toModel,
        reason: row.reason,
        impact: row.impact,
        migratedById: row.migratedById,
        createdAt: row.createdAt,
      })),
    };
  }

  // Chooses the model of a year that has not started.
  async set(
    actorId: string,
    schoolId: string,
    yearId: string,
    model: InstructionalModel,
    reason: string | null,
  ): Promise<void> {
    await this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const year = await this.year(manager, schoolId, yearId, true);
      if (!this.isFutureCycle(year, await this.today(manager, schoolId))) {
        throw new RuleViolation(ModelMessages.started(yearName(year)));
      }
      const setting = await this.settingFor(manager, year);
      if (setting?.model === model) return;
      const saved = await this.save(manager, year, setting, model, actorId);
      await this.audit.record(manager, {
        action: AuditAction.InstructionalModelChanged,
        subject: { type: SETTING_SUBJECT, id: saved.id },
        context: {
          from: setting?.model ?? null,
          to: model,
          school_id: schoolId,
          academic_year_id: year.id,
          reason: reason?.trim() || null,
        },
        schoolId,
      });
    });
  }

  // Moves a running year to another model, with a reason and its impact.
  async migrate(
    actorId: string,
    schoolId: string,
    yearId: string,
    model: InstructionalModel,
    reason: string,
  ): Promise<InstructionalModelMigration> {
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const year = await this.year(manager, schoolId, yearId, true);
      const name = yearName(year);
      const setting = await this.settingFor(manager, year);
      const current = setting?.model ?? DEFAULT_INSTRUCTIONAL_MODEL;
      const why = reason.trim();
      if (isFrozen(year.status)) {
        throw new RuleViolation(ModelMessages.finished(name));
      }
      if (!isOperational(year.status)) {
        throw new RuleViolation(ModelMessages.notStarted(name));
      }
      if (current === model) {
        throw new RuleViolation(
          ModelMessages.same(name, INSTRUCTIONAL_MODEL_LABELS[model]),
        );
      }
      if (!why) {
        throw new RuleViolation(ModelMessages.reason, {
          reason: [ModelMessages.reason],
        });
      }

      const impact = await this.impactOf(manager, year, model);
      await this.save(manager, year, setting, model, actorId);
      const migration = await manager.save(
        newInSchool(
          manager,
          InstructionalModelMigration,
          {
            academicYearId: year.id,
            fromModel: current,
            toModel: model,
            reason: why,
            impact,
            migratedById: actorId,
          },
          { schoolId },
        ),
      );
      await this.audit.record(manager, {
        action: AuditAction.InstructionalModelMigrated,
        subject: { type: MIGRATION_SUBJECT, id: migration.id },
        context: {
          from: current,
          to: model,
          reason: why,
          school_id: schoolId,
          academic_year_id: year.id,
          impact,
        },
        schoolId,
      });
      return migration;
    });
  }

  async impactOf(
    manager: EntityManager,
    year: AcademicYear,
    model: InstructionalModel,
  ): Promise<MigrationImpact> {
    const impact: MigrationImpact = {
      offerings: 0,
      offerings_by_roster: {},
      exceptions: 0,
      exception_rosters: {},
    };
    for (const contributor of this.contributors) {
      Object.assign(impact, await contributor(manager, year, model));
    }
    return impact;
  }

  private async save(
    manager: EntityManager,
    year: AcademicYear,
    setting: InstructionalModelSetting | null,
    model: InstructionalModel,
    actorId: string,
  ): Promise<InstructionalModelSetting> {
    const row =
      setting ??
      newInSchool(
        manager,
        InstructionalModelSetting,
        { academicYearId: year.id },
        { schoolId: year.schoolId },
      );
    row.model = model;
    row.updatedById = actorId;
    return manager.save(row);
  }

  private year(
    manager: EntityManager,
    schoolId: string,
    yearId: string,
    lock = false,
  ): Promise<AcademicYear> {
    return findInSchool(
      manager,
      AcademicYear,
      { id: yearId },
      { schoolId, lock, notFound: 'Academic year not found.' },
    );
  }

  private async today(
    manager: EntityManager,
    schoolId: string,
  ): Promise<string> {
    const school = await manager.findOneOrFail(School, {
      where: { id: schoolId },
    });
    return this.clock.schoolToday(school.timezone);
  }
}
