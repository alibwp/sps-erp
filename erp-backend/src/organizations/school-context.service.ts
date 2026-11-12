import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PlatformPermission } from '../access/access.constants.js';
import { PermissionResolver } from '../access/permission-resolver.service.js';
import { School } from './entities/school.entity.js';
import { SchoolMembership } from './entities/school-membership.entity.js';

export interface ContextCampus {
  id: string;
  name: string;
  code: string;
  initials: string | null;
  timezone: string;
  organization: { id: string; name: string };
  isPrimary: boolean;
}

export interface WorkingContext {
  defaultSchoolId: string | null;
  campuses: ContextCampus[];
}

// The campuses a person can work in and the one they open by default
// (reference SchoolContext::defaultSchoolFor): the primary active
// membership, then the oldest one; with "access all schools" and no
// membership, the first campus. A platform administrator is offered every
// campus.
@Injectable()
export class SchoolContext {
  constructor(
    private readonly dataSource: DataSource,
    private readonly resolver: PermissionResolver,
  ) {}

  async forUser(userId: string): Promise<WorkingContext> {
    const manager = this.dataSource.manager;
    const memberships = await manager.find(SchoolMembership, {
      where: { userId, status: 'active' },
      relations: { school: { organization: true } },
      order: { isPrimary: 'DESC', createdAt: 'ASC' },
    });
    const global = await this.resolver.globalPermissions(userId, manager);
    const allSchools = global.has(PlatformPermission.AccessAllSchools);

    const primaryIds = new Set(
      memberships.filter((m) => m.isPrimary).map((m) => m.schoolId),
    );
    const schools = allSchools
      ? await manager.find(School, {
          relations: { organization: true },
          order: { createdAt: 'ASC' },
        })
      : memberships.map((membership) => membership.school);

    const campuses = schools
      .map((school) => ({
        id: school.id,
        name: school.name,
        code: school.code,
        initials: school.initials,
        timezone: school.timezone,
        organization: {
          id: school.organization.id,
          name: school.organization.name,
        },
        isPrimary: primaryIds.has(school.id),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const defaultSchoolId =
      memberships[0]?.schoolId ??
      (allSchools ? (schools[0]?.id ?? null) : null);
    return { defaultSchoolId, campuses };
  }
}
