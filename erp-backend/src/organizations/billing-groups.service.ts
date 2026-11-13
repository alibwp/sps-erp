import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { OrganizationPermission } from '../access/access.constants.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { TransactionService } from '../common/database/transaction.service.js';
import { RuleViolation } from '../common/errors/api-exception.js';
import { postgresCode } from '../common/errors/error-response.js';
import { BillingGroup } from './entities/billing-group.entity.js';
import { School } from './entities/school.entity.js';
import { SCHOOL_SUBJECT } from './campuses.service.js';
import { OrganizationAccess } from './organization-access.service.js';
import type { BillingGroupDto } from './organizations.dto.js';

export const BILLING_GROUP_SUBJECT = 'billing_group';
const NAME_TAKEN = 'This organization already has a group with that name.';

// Which campuses of an organization keep one purse (reference
// ManageBillingGroups). Nothing already in the books moves. The reference
// gates the whole screen with "manage organization".
@Injectable()
export class BillingGroups {
  constructor(
    private readonly dataSource: DataSource,
    private readonly transactions: TransactionService,
    private readonly access: OrganizationAccess,
    private readonly audit: AuditService,
  ) {}

  async list(
    actorId: string,
    organizationId: string,
  ): Promise<BillingGroupDto[]> {
    await this.access.authorize(
      this.dataSource.manager,
      actorId,
      organizationId,
      OrganizationPermission.Manage,
    );
    const groups = await this.dataSource.manager.find(BillingGroup, {
      where: { organizationId },
      order: { name: 'ASC' },
    });
    return this.describe(groups);
  }

  async start(
    actorId: string,
    organizationId: string,
    name: string,
  ): Promise<BillingGroupDto> {
    try {
      const group = await this.transactions.run(async (tx) => {
        await this.access.authorize(
          tx.manager,
          actorId,
          organizationId,
          OrganizationPermission.Manage,
          { lock: true },
        );
        const taken = await tx.manager
          .createQueryBuilder(BillingGroup, 'group')
          .where('group.organizationId = :organizationId', { organizationId })
          .andWhere('lower(group.name) = lower(:name)', { name })
          .getExists();
        if (taken) throw new RuleViolation(NAME_TAKEN, { name: [NAME_TAKEN] });

        const saved = await tx.manager.save(
          tx.manager.create(BillingGroup, { organizationId, name }),
        );
        await this.audit.record(tx.manager, {
          action: AuditAction.BillingGroupChanged,
          subject: { type: BILLING_GROUP_SUBJECT, id: saved.id },
          context: { change: 'started', name },
          schoolId: null,
        });
        return saved;
      });
      return (await this.describe([group]))[0];
    } catch (error) {
      if (postgresCode(error) === '23505') {
        throw new RuleViolation(NAME_TAKEN, { name: [NAME_TAKEN] });
      }
      throw error;
    }
  }

  // Puts a campus in a group, or lets it bill on its own (null).
  async place(
    actorId: string,
    organizationId: string,
    schoolId: string,
    groupId: string | null,
  ): Promise<School> {
    return this.transactions.run(async (tx) => {
      await this.access.authorize(
        tx.manager,
        actorId,
        organizationId,
        OrganizationPermission.Manage,
      );
      const school = await tx.manager.findOne(School, {
        where: { id: schoolId, organizationId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!school) throw new NotFoundException('Campus not found.');

      if (groupId !== null) {
        // Waits for a delete of the same group to finish, so a campus is
        // never placed in a group that is gone.
        const group = await tx.lockOne(BillingGroup, { id: groupId });
        if (!group || group.organizationId !== organizationId) {
          throw new RuleViolation(
            'That group no longer exists. Choose another.',
            {
              billingGroupId: ['That group no longer exists. Choose another.'],
            },
          );
        }
      }
      if (school.billingGroupId === groupId) return school;

      const previous = school.billingGroupId;
      school.billingGroupId = groupId;
      const saved = await tx.manager.save(school);
      await this.audit.record(tx.manager, {
        action: AuditAction.BillingGroupChanged,
        subject: { type: SCHOOL_SUBJECT, id: saved.id },
        context: {
          change: 'campus_placed',
          billing_group_id: groupId,
          previous_billing_group_id: previous,
        },
        schoolId: saved.id,
      });
      return saved;
    });
  }

  // Deletes a group no campus is in.
  async delete(
    actorId: string,
    organizationId: string,
    groupId: string,
  ): Promise<void> {
    await this.transactions.run(async (tx) => {
      await this.access.authorize(
        tx.manager,
        actorId,
        organizationId,
        OrganizationPermission.Manage,
      );
      const group = await tx.lockOne(BillingGroup, {
        id: groupId,
        organizationId,
      });
      if (!group) throw new NotFoundException('Billing group not found.');
      const inUse = await tx.manager.findOne(School, {
        where: { billingGroupId: group.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (inUse) {
        throw new RuleViolation(
          `Take every campus out of ${group.name} first.`,
        );
      }
      await tx.manager.delete(BillingGroup, { id: group.id });
      await this.audit.record(tx.manager, {
        action: AuditAction.BillingGroupChanged,
        subject: { type: BILLING_GROUP_SUBJECT, id: group.id },
        context: { change: 'deleted', name: group.name },
        schoolId: null,
      });
    });
  }

  private async describe(groups: BillingGroup[]): Promise<BillingGroupDto[]> {
    if (!groups.length) return [];
    const schools = await this.dataSource.manager.find(School, {
      where: { billingGroupId: In(groups.map((group) => group.id)) },
      select: { id: true, billingGroupId: true },
    });
    return groups.map((group) => ({
      id: group.id,
      name: group.name,
      schoolIds: schools
        .filter((school) => school.billingGroupId === group.id)
        .map((school) => school.id),
      createdAt: group.createdAt,
    }));
  }
}
