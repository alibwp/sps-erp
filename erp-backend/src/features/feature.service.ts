import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { TransactionService } from '../common/database/transaction.service.js';
import { ValidationFailed } from '../common/errors/api-exception.js';
import { FeatureSetting } from './feature-setting.entity.js';
import {
  FEATURES,
  FEATURE_CONFIG_KEYS,
  FEATURE_INFO,
  type Feature,
} from './features.js';

export type FeatureSource = 'campus' | 'platform' | 'default';

export interface FeatureState {
  feature: Feature;
  label: string;
  description: string;
  group: string;
  enabled: boolean;
  defaultEnabled: boolean;
  // Where the answer comes from: the campus's own setting, the
  // platform-wide setting, or the built-in default.
  source: FeatureSource;
  // The feature's settings with their defaults filled in (every setting is
  // a switch that defaults to on); null for a feature without settings.
  config: Record<string, boolean> | null;
}

export const FEATURE_SUBJECT = 'feature_setting';

// Says whether a feature is on at a campus, and switches it (reference
// app/Services/Feature/FeatureManager.php). The campus's own setting wins,
// then the platform-wide one (school_id null), then the default. Switching
// a feature off hides its routes (404) and deletes nothing.
@Injectable()
export class FeatureService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly transactions: TransactionService,
    private readonly audit: AuditService,
  ) {}

  async enabled(
    feature: Feature,
    schoolId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<boolean> {
    const settings = await this.settingsFor(schoolId, manager);
    return (
      settings.get(feature)?.enabled ?? FEATURE_INFO[feature].defaultEnabled
    );
  }

  async list(
    schoolId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<FeatureState[]> {
    const settings = await this.settingsFor(schoolId, manager);
    return FEATURES.map((feature) => {
      const setting = settings.get(feature);
      const info = FEATURE_INFO[feature];
      return {
        feature,
        label: info.label,
        description: info.description,
        group: info.group,
        enabled: setting?.enabled ?? info.defaultEnabled,
        defaultEnabled: info.defaultEnabled,
        source: setting
          ? setting.schoolId === null
            ? 'platform'
            : 'campus'
          : 'default',
        config: this.resolvedConfig(feature, setting?.config ?? null),
      };
    });
  }

  // Writes the campus's own setting. Settings sent in `config` are merged
  // over the ones already saved, so one switch can change at a time.
  async set(
    actorId: string,
    schoolId: string,
    feature: Feature,
    enabled: boolean,
    config?: Record<string, unknown>,
  ): Promise<FeatureState> {
    const changes =
      config === undefined ? undefined : this.validConfig(feature, config);
    await this.transactions.run(async (tx) => {
      let setting = await tx.manager.findOne(FeatureSetting, {
        where: { schoolId, feature },
        lock: { mode: 'pessimistic_write' },
      });
      setting ??= tx.manager.create(FeatureSetting, { schoolId, feature });
      setting.enabled = enabled;
      if (changes) setting.config = { ...setting.config, ...changes };
      setting.updatedById = actorId;
      setting = await tx.manager.save(setting);

      await this.audit.record(tx.manager, {
        action: enabled
          ? AuditAction.FeatureEnabled
          : AuditAction.FeatureDisabled,
        subject: { type: FEATURE_SUBJECT, id: setting.id },
        context: { feature, school_id: schoolId },
        schoolId,
      });
    });
    const states = await this.list(schoolId);
    return states.find((state) => state.feature === feature)!;
  }

  // The settings that can apply to a campus, narrowest first.
  private async settingsFor(
    schoolId: string,
    manager: EntityManager,
  ): Promise<Map<Feature, FeatureSetting>> {
    const rows = await manager
      .createQueryBuilder(FeatureSetting, 'setting')
      .where('(setting.schoolId = :schoolId OR setting.schoolId IS NULL)', {
        schoolId,
      })
      .getMany();
    const byFeature = new Map<Feature, FeatureSetting>();
    for (const row of rows) {
      if (!byFeature.has(row.feature) || row.schoolId !== null) {
        byFeature.set(row.feature, row);
      }
    }
    return byFeature;
  }

  private resolvedConfig(
    feature: Feature,
    stored: Record<string, boolean> | null,
  ): Record<string, boolean> | null {
    const keys = FEATURE_CONFIG_KEYS[feature];
    if (!keys) return null;
    return Object.fromEntries(keys.map((key) => [key, stored?.[key] ?? true]));
  }

  private validConfig(
    feature: Feature,
    config: Record<string, unknown>,
  ): Record<string, boolean> {
    const keys = FEATURE_CONFIG_KEYS[feature];
    if (!keys) {
      throw new ValidationFailed({
        config: [`${FEATURE_INFO[feature].label} has no settings.`],
      });
    }
    const problems: string[] = [];
    for (const [key, value] of Object.entries(config)) {
      if (!keys.includes(key))
        problems.push(`"${key}" is not a setting of this feature.`);
      else if (typeof value !== 'boolean')
        problems.push(`"${key}" must be true or false.`);
    }
    if (problems.length) throw new ValidationFailed({ config: problems });
    return config as Record<string, boolean>;
  }
}
