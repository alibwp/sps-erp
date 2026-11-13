import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { paginate, type Paginated } from '../common/pagination/pagination.js';
import { inSchool } from '../common/tenancy/school-scope.js';
import { User } from '../identity/entities/user.entity.js';
import { isBuiltInRole } from './access.constants.js';
import type {
  HeldRoleDto,
  RoleDetailDto,
  RoleDto,
  RoleListQueryDto,
} from './access.dto.js';
import { RoleAssignment } from './entities/role-assignment.entity.js';
import { Role } from './entities/role.entity.js';

const SYSTEM_ROLES = ['platform-admin', 'organization-admin'];

// Read models for the roles of a campus.
@Injectable()
export class RoleQueries {
  constructor(private readonly dataSource: DataSource) {}

  // The campus's own roles and the shared ones, never the two the platform
  // gives. A shared role the campus keeps its own copy of is listed once,
  // as the copy (reference CampusRoleController::index).
  async list(
    schoolId: string,
    query: RoleListQueryDto,
  ): Promise<Paginated<RoleDto>> {
    const qb = inSchool(
      this.dataSource.manager.createQueryBuilder(Role, 'role'),
      {
        schoolId,
        includeShared: true,
      },
    )
      .andWhere(
        'NOT (role.schoolId IS NULL AND role.name IN (:...systemRoles))',
        { systemRoles: SYSTEM_ROLES },
      )
      .andWhere(
        `NOT (role.schoolId IS NULL AND EXISTS (
           SELECT 1 FROM roles own
            WHERE own.school_id = :schoolId AND lower(own.name) = lower(role.name)))`,
        { schoolId },
      );
    if (query.archived === 'true') qb.andWhere('role.archivedAt IS NOT NULL');
    if (query.archived === 'false') qb.andWhere('role.archivedAt IS NULL');
    if (query.search) {
      qb.andWhere('role.name ILIKE :search', {
        search: `%${escapeLike(query.search)}%`,
      });
    }

    const page = await paginate(
      qb,
      query,
      { name: 'role.name', createdAt: 'role.createdAt' },
      [{ column: 'role.name', direction: 'ASC' }],
    );
    return { data: await this.describe(schoolId, page.data), meta: page.meta };
  }

  async detail(schoolId: string, role: Role): Promise<RoleDetailDto> {
    const [described] = await this.describe(schoolId, [role]);
    const people = await this.dataSource.manager
      .createQueryBuilder(User, 'user')
      .innerJoin(
        RoleAssignment,
        'a',
        'a.userId = user.id AND a.roleId = :roleId AND a.schoolId = :schoolId',
        { roleId: role.id, schoolId },
      )
      .select(['user.id', 'user.name', 'user.email'])
      .orderBy('user.name')
      .getMany();
    return {
      ...described,
      people: people.map(({ id, name, email }) => ({ id, name, email })),
    };
  }

  async describe(schoolId: string, roles: Role[]): Promise<RoleDto[]> {
    if (!roles.length) return [];
    const ids = roles.map((role) => role.id);
    const manager = this.dataSource.manager;
    const permissionRows = (await manager.query(
      `SELECT rp.role_id, p.name
         FROM role_has_permissions rp
         JOIN permissions p ON p.id = rp.permission_id
        WHERE rp.role_id = ANY($1::uuid[])
        ORDER BY p.name`,
      [ids],
    )) as Array<{ role_id: string; name: string }>;
    const holderRows = (await manager.query(
      `SELECT role_id, count(*)::int AS holders
         FROM model_has_roles
        WHERE role_id = ANY($1::uuid[]) AND school_id = $2
        GROUP BY role_id`,
      [ids, schoolId],
    )) as Array<{ role_id: string; holders: number }>;

    return roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      shared: role.schoolId === null,
      builtIn: role.schoolId === null && isBuiltInRole(role.name),
      archivedAt: role.archivedAt,
      permissions: permissionRows
        .filter((row) => row.role_id === role.id)
        .map((row) => row.name),
      holders: holderRows.find((row) => row.role_id === role.id)?.holders ?? 0,
    }));
  }

  // The roles a person holds at a campus, and their global roles.
  async heldBy(
    userId: string,
    schoolId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<HeldRoleDto[]> {
    const rows = await manager
      .createQueryBuilder(RoleAssignment, 'a')
      .innerJoin('a.role', 'role')
      .select('role.id', 'id')
      .addSelect('role.name', 'name')
      .addSelect('a.schoolId', 'school_id')
      .where('a.userId = :userId', { userId })
      .andWhere('(a.schoolId = :schoolId OR a.schoolId IS NULL)', { schoolId })
      .orderBy('role.name')
      .getRawMany<{ id: string; name: string; school_id: string | null }>();
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      global: row.school_id === null,
    }));
  }
}

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}
