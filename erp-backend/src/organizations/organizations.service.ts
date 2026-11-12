import { Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { DataSource, EntityManager, In } from 'typeorm';
import {
  Forbidden,
  OrganizationPermission,
  PlatformPermission,
} from '../access/access.constants.js';
import { PermissionResolver } from '../access/permission-resolver.service.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { TransactionService } from '../common/database/transaction.service.js';
import { ValidationFailed } from '../common/errors/api-exception.js';
import { postgresCode } from '../common/errors/error-response.js';
import { paginate, type Paginated } from '../common/pagination/pagination.js';
import type { PaginationQueryDto } from '../common/pagination/pagination.js';
import { escapeLike } from '../access/role-queries.service.js';
import { OrganizationMembership } from './entities/organization-membership.entity.js';
import { Organization } from './entities/organization.entity.js';
import { OrganizationAccess } from './organization-access.service.js';
import type {
  CreateOrganizationDto,
  UpdateOrganizationDto,
} from './organizations.dto.js';

export const ORGANIZATION_SUBJECT = 'organization';
const CODE_TAKEN = 'Another organization already uses this code.';
const CODE_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

// A random code of upper-case letters and digits (organizations: 12, as
// the reference's Str::upper(Str::random(12)); campuses: 10).
export function randomCode(length: number): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CODE_CHARACTERS[randomInt(CODE_CHARACTERS.length)];
  }
  return code;
}

// Reference CreateOrganization and UpdateOrganization.
@Injectable()
export class Organizations {
  constructor(
    private readonly dataSource: DataSource,
    private readonly transactions: TransactionService,
    private readonly access: OrganizationAccess,
    private readonly resolver: PermissionResolver,
    private readonly audit: AuditService,
  ) {}

  // Platform administrators only ("access all organizations").
  async create(
    actorId: string,
    input: CreateOrganizationDto,
  ): Promise<Organization> {
    const global = await this.resolver.globalPermissions(actorId);
    if (!global.has(PlatformPermission.AccessAllOrganizations)) {
      throw new Forbidden();
    }
    return this.unique(() =>
      this.transactions.run((tx) =>
        this.createIn(tx.manager, {
          name: input.name,
          code: input.code ?? null,
          address: input.address ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
        }),
      ),
    );
  }

  // Also used by the install command, inside its transaction.
  async createIn(
    manager: EntityManager,
    input: Pick<Organization, 'name' | 'address' | 'email' | 'phone'> & {
      code: string | null;
    },
    actorId?: string | null,
  ): Promise<Organization> {
    const organization = await manager.save(
      manager.create(Organization, {
        ...input,
        code: input.code ?? randomCode(12),
      }),
    );
    await this.audit.record(manager, {
      action: AuditAction.OrganizationCreated,
      subject: { type: ORGANIZATION_SUBJECT, id: organization.id },
      context: { organization_id: organization.id },
      schoolId: null,
      ...(actorId !== undefined ? { actorId } : {}),
    });
    return organization;
  }

  async update(
    actorId: string,
    organizationId: string,
    input: UpdateOrganizationDto,
  ): Promise<Organization> {
    return this.unique(() =>
      this.transactions.run(async (tx) => {
        const organization = await this.access.authorize(
          tx.manager,
          actorId,
          organizationId,
          OrganizationPermission.Manage,
          { lock: true },
        );
        const changed: string[] = [];
        for (const field of [
          'name',
          'code',
          'address',
          'email',
          'phone',
        ] as const) {
          const value = input[field];
          if (value !== undefined && value !== organization[field]) {
            (organization as unknown as Record<string, unknown>)[field] = value;
            changed.push(field);
          }
        }
        if (!changed.length) return organization;

        const saved = await tx.manager.save(organization);
        await this.audit.record(tx.manager, {
          action: AuditAction.OrganizationUpdated,
          subject: { type: ORGANIZATION_SUBJECT, id: saved.id },
          context: { organization_id: saved.id, changed },
          schoolId: null,
        });
        return saved;
      }),
    );
  }

  async show(actorId: string, organizationId: string): Promise<Organization> {
    return this.access.authorize(
      this.dataSource.manager,
      actorId,
      organizationId,
      OrganizationPermission.Read,
    );
  }

  // Every organization for a platform administrator; otherwise the ones
  // the person may read through an active membership.
  async list(
    actorId: string,
    query: PaginationQueryDto,
  ): Promise<Paginated<Organization>> {
    const manager = this.dataSource.manager;
    const qb = manager.createQueryBuilder(Organization, 'organization');
    const global = await this.resolver.globalPermissions(actorId, manager);
    if (!global.has(PlatformPermission.AccessAllOrganizations)) {
      const memberships = await manager.find(OrganizationMembership, {
        where: { userId: actorId, status: 'active' },
      });
      const readable: string[] = [];
      for (const membership of memberships) {
        if (
          await this.access.allows(
            manager,
            actorId,
            membership.organizationId,
            OrganizationPermission.Read,
          )
        ) {
          readable.push(membership.organizationId);
        }
      }
      if (!readable.length)
        return {
          data: [],
          meta: { page: query.page, perPage: query.perPage, total: 0 },
        };
      qb.where({ id: In(readable) });
    }
    if (query.search) {
      qb.andWhere(
        '(organization.name ILIKE :search OR organization.code ILIKE :search)',
        {
          search: `%${escapeLike(query.search)}%`,
        },
      );
    }
    return paginate(
      qb,
      query,
      {
        name: 'organization.name',
        code: 'organization.code',
        createdAt: 'organization.createdAt',
      },
      [{ column: 'organization.name', direction: 'ASC' }],
    );
  }

  permissionsFor(actorId: string, organizationId: string): Promise<string[]> {
    return this.access.permissionsFor(
      this.dataSource.manager,
      actorId,
      organizationId,
    );
  }

  // A code another organization uses is a validation error, as in the
  // reference's form.
  private async unique<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (postgresCode(error) === '23505') {
        throw new ValidationFailed({ code: [CODE_TAKEN] });
      }
      throw error;
    }
  }
}
