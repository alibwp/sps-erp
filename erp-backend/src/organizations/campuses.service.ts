import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { OrganizationPermission } from '../access/access.constants.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { Clock } from '../common/clock/clock.js';
import { randomToken } from '../common/crypto/app-crypto.service.js';
import { TransactionService } from '../common/database/transaction.service.js';
import { ValidationFailed } from '../common/errors/api-exception.js';
import { detectFileType } from '../common/files/file-type.js';
import { paginate, type Paginated } from '../common/pagination/pagination.js';
import type { PaginationQueryDto } from '../common/pagination/pagination.js';
import { findInSchool, newInSchool } from '../common/tenancy/school-scope.js';
import { escapeLike } from '../access/role-queries.service.js';
import { StorageService } from '../storage/storage.service.js';
import { SchoolOperatingProfile } from './entities/school-operating-profile.entity.js';
import { School } from './entities/school.entity.js';
import { OrganizationAccess } from './organization-access.service.js';
import type {
  CampusDto,
  OpenCampusDto,
  OperatingProfileDto,
  SetOperatingProfileDto,
  UpdateCampusDto,
} from './organizations.dto.js';
import { randomCode } from './organizations.service.js';
import { SchoolMemberships } from './school-memberships.service.js';

export const SCHOOL_SUBJECT = 'school';
export const CAMPUS_NOT_FOUND = 'Campus not found.';

// Reference: logo nullable image max:5120 (kilobytes); jpg or png by content.
export const LOGO_MAX_BYTES = 5120 * 1024;
export const LOGO_URL_SECONDS = 15 * 60;
export const LOGO_TOO_LARGE =
  'The logo field must not be greater than 5120 kilobytes.';

// The starting words of each preset (reference SchoolOperatingProfile).
export const DEFAULT_PRESET = 'home_sections';
export const PRESET_LABELS: Record<string, Record<string, string>> = {
  home_sections: {
    academic_year: 'Academic year',
    class_level: 'Class',
    section: 'Section',
    period: 'Term',
    course: 'Subject',
    fee: 'School fees',
    homeroom_teacher: 'Class teacher',
  },
  subject_schedule: {
    academic_year: 'Academic year',
    class_level: 'Grade',
    section: 'Homeroom',
    period: 'Semester',
    course: 'Course',
    fee: 'Tuition',
    homeroom_teacher: 'Class teacher',
  },
  hybrid: {
    academic_year: 'Academic year',
    class_level: 'Grade',
    section: 'Section',
    period: 'Term',
    course: 'Subject',
    fee: 'Fees',
    homeroom_teacher: 'Class teacher',
  },
};

const DETAIL_FIELDS = [
  'name',
  'initials',
  'phone',
  'email',
  'address',
  'country',
  'state',
  'city',
  'postalCode',
  'timezone',
] as const;
// The form's required fields: once all are filled the details step of the
// campus setup is complete.
const REQUIRED_DETAILS = [
  'name',
  'address',
  'country',
  'state',
  'city',
  'postalCode',
  'timezone',
] as const;

// Campuses (reference OpenCampus, SchoolService, EditSchoolLanguage).
@Injectable()
export class Campuses {
  private readonly logger = new Logger(Campuses.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly transactions: TransactionService,
    private readonly access: OrganizationAccess,
    private readonly memberships: SchoolMemberships,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  // Adds a campus to an organization. The person who opened it joins it
  // (without making it their primary campus, unless it is their first), so
  // setup can continue there.
  async open(
    actorId: string,
    organizationId: string,
    details: OpenCampusDto,
  ): Promise<School> {
    return this.transactions.run(async (tx) => {
      await this.access.authorize(
        tx.manager,
        actorId,
        organizationId,
        OrganizationPermission.ManageCampuses,
      );
      const school = await this.openIn(tx.manager, organizationId, details);
      await this.memberships.grant(tx.manager, actorId, school.id);
      return school;
    });
  }

  // Creates the campus and its operating profile (also used by install).
  async openIn(
    manager: EntityManager,
    organizationId: string,
    details: Partial<Pick<School, (typeof DETAIL_FIELDS)[number]>> &
      Pick<School, 'name' | 'timezone'>,
    actorId?: string | null,
  ): Promise<School> {
    const school = manager.create(School, {
      organizationId,
      code: randomCode(10),
      ...Object.fromEntries(
        DETAIL_FIELDS.map((field) => [field, details[field] ?? null]),
      ),
    });
    school.setupDetailsCompletedAt = this.detailsComplete(school)
      ? this.clock.now()
      : null;
    const saved = await manager.save(school);
    await manager.save(
      newInSchool(
        manager,
        SchoolOperatingProfile,
        { preset: DEFAULT_PRESET, labels: PRESET_LABELS[DEFAULT_PRESET] },
        { schoolId: saved.id },
      ),
    );
    await this.audit.record(manager, {
      action: AuditAction.SchoolOpened,
      subject: { type: SCHOOL_SUBJECT, id: saved.id },
      context: { organization_id: organizationId, name: saved.name },
      schoolId: saved.id,
      ...(actorId !== undefined ? { actorId } : {}),
    });
    return saved;
  }

  // Edits a campus from its organization ("manage organization campuses").
  async updateFromOrganization(
    actorId: string,
    organizationId: string,
    schoolId: string,
    changes: UpdateCampusDto,
  ): Promise<School> {
    return this.transactions.run(async (tx) => {
      await this.access.authorize(
        tx.manager,
        actorId,
        organizationId,
        OrganizationPermission.ManageCampuses,
      );
      const school = await this.campusOf(
        tx.manager,
        organizationId,
        schoolId,
        true,
      );
      return this.applyDetails(tx.manager, school, changes);
    });
  }

  // Edits the working campus ("update school" or "manage school settings").
  async update(schoolId: string, changes: UpdateCampusDto): Promise<School> {
    return this.transactions.run(async (tx) => {
      const school = await tx.lockOne(School, { id: schoolId });
      if (!school) throw new NotFoundException(CAMPUS_NOT_FOUND);
      return this.applyDetails(tx.manager, school, changes);
    });
  }

  async list(
    actorId: string,
    organizationId: string,
    query: PaginationQueryDto,
  ): Promise<Paginated<School>> {
    await this.access.authorize(
      this.dataSource.manager,
      actorId,
      organizationId,
      OrganizationPermission.Read,
    );
    const qb = this.dataSource.manager
      .createQueryBuilder(School, 'school')
      .where('school.organizationId = :organizationId', { organizationId });
    if (query.search) {
      qb.andWhere('(school.name ILIKE :search OR school.code ILIKE :search)', {
        search: `%${escapeLike(query.search)}%`,
      });
    }
    return paginate(
      qb,
      query,
      {
        name: 'school.name',
        code: 'school.code',
        createdAt: 'school.createdAt',
      },
      [{ column: 'school.name', direction: 'ASC' }],
    );
  }

  // Stores a jpg or png (checked by content) and deletes the old file after
  // commit.
  async setLogo(
    schoolId: string,
    content: Buffer | undefined,
  ): Promise<School> {
    if (!content || content.length === 0) {
      throw new ValidationFailed({ logo: ['The logo field is required.'] });
    }
    if (content.length > LOGO_MAX_BYTES) {
      throw new ValidationFailed({ logo: [LOGO_TOO_LARGE] });
    }
    const type = detectFileType(content);
    if (!type) {
      throw new ValidationFailed({
        logo: ['The logo field must be a file of type: jpg, jpeg, png.'],
      });
    }
    const key = `schools/${schoolId}/logo-${randomToken(12)}.${type.extension}`;
    await this.storage.put(key, content, { contentType: type.mime });
    try {
      return await this.replaceLogo(schoolId, key);
    } catch (error) {
      await this.deleteFile(key);
      throw error;
    }
  }

  removeLogo(schoolId: string): Promise<School> {
    return this.replaceLogo(schoolId, null);
  }

  async profile(schoolId: string): Promise<OperatingProfileDto> {
    const profile = await findInSchool(
      this.dataSource.manager,
      SchoolOperatingProfile,
      {},
      { schoolId },
    );
    return {
      preset: profile.preset,
      labels: { ...PRESET_LABELS[DEFAULT_PRESET], ...profile.labels },
      setupCompletedAt: profile.setupCompletedAt,
    };
  }

  async setProfile(
    schoolId: string,
    input: SetOperatingProfileDto,
  ): Promise<OperatingProfileDto> {
    await this.transactions.run(async (tx) => {
      const profile = await findInSchool(
        tx.manager,
        SchoolOperatingProfile,
        {},
        { schoolId, lock: true },
      );
      const labels = { ...input.labels };
      const changed =
        profile.preset !== input.preset ||
        JSON.stringify(profile.labels) !== JSON.stringify(labels);
      profile.preset = input.preset;
      profile.labels = labels;
      profile.setupCompletedAt = this.clock.now();
      await tx.manager.save(profile);
      if (changed) {
        await this.audit.record(tx.manager, {
          action: AuditAction.SchoolUpdated,
          subject: { type: SCHOOL_SUBJECT, id: schoolId },
          context: { changed: ['operating_profile'], preset: input.preset },
          schoolId,
        });
      }
    });
    return this.profile(schoolId);
  }

  async toDto(school: School): Promise<CampusDto> {
    return {
      id: school.id,
      organizationId: school.organizationId,
      billingGroupId: school.billingGroupId,
      name: school.name,
      code: school.code,
      initials: school.initials,
      address: school.address,
      city: school.city,
      state: school.state,
      postalCode: school.postalCode,
      country: school.country,
      timezone: school.timezone,
      phone: school.phone,
      email: school.email,
      logoUrl: school.logoPath
        ? await this.storage.signedUrl(school.logoPath, {
            expiresInSeconds: LOGO_URL_SECONDS,
          })
        : null,
      setupDetailsCompletedAt: school.setupDetailsCompletedAt,
      createdAt: school.createdAt,
    };
  }

  // A campus of this organization; another organization's answers 404.
  async campusOf(
    manager: EntityManager,
    organizationId: string,
    schoolId: string,
    lock = false,
  ): Promise<School> {
    const school = await manager.findOne(School, {
      where: { id: schoolId, organizationId },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!school) throw new NotFoundException(CAMPUS_NOT_FOUND);
    return school;
  }

  private async applyDetails(
    manager: EntityManager,
    school: School,
    changes: UpdateCampusDto,
  ): Promise<School> {
    const changed: string[] = [];
    for (const field of DETAIL_FIELDS) {
      const value = changes[field];
      if (value !== undefined && value !== school[field]) {
        (school as unknown as Record<string, unknown>)[field] = value;
        changed.push(field);
      }
    }
    if (!changed.length) return school;
    if (!school.setupDetailsCompletedAt && this.detailsComplete(school)) {
      school.setupDetailsCompletedAt = this.clock.now();
    }
    const saved = await manager.save(school);
    await this.audit.record(manager, {
      action: AuditAction.SchoolUpdated,
      subject: { type: SCHOOL_SUBJECT, id: saved.id },
      context: { changed },
      schoolId: saved.id,
    });
    return saved;
  }

  private detailsComplete(school: School): boolean {
    return REQUIRED_DETAILS.every((field) => Boolean(school[field]));
  }

  private replaceLogo(schoolId: string, key: string | null): Promise<School> {
    return this.transactions.run(async (tx) => {
      const school = await tx.lockOne(School, { id: schoolId });
      if (!school) throw new NotFoundException(CAMPUS_NOT_FOUND);
      const previous = school.logoPath;
      if (previous === key) return school;
      school.logoPath = key;
      const saved = await tx.manager.save(school);
      await this.audit.record(tx.manager, {
        action: AuditAction.SchoolUpdated,
        subject: { type: SCHOOL_SUBJECT, id: schoolId },
        context: { changed: ['logo'] },
        schoolId,
      });
      if (previous) tx.afterCommit(() => this.deleteFile(previous));
      return saved;
    });
  }

  private async deleteFile(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch (error) {
      this.logger.warn(
        `Could not delete ${key}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
