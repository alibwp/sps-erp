import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RoleQueries, escapeLike } from '../access/role-queries.service.js';
import { Clock } from '../common/clock/clock.js';
import { paginate, type Paginated } from '../common/pagination/pagination.js';
import { AccountInvitation } from '../identity/entities/account-invitation.entity.js';
import { User } from '../identity/entities/user.entity.js';
import { PHOTO_URL_SECONDS } from '../identity/profile/profile.service.js';
import { SchoolMembership } from '../organizations/entities/school-membership.entity.js';
import { StorageService } from '../storage/storage.service.js';
import { AccountAuthority } from './account-authority.service.js';
import type {
  AccountDetailDto,
  AccountDto,
  AccountInvitationDto,
  AccountListQueryDto,
  InvitationListQueryDto,
  InvitationStatus,
} from './accounts.dto.js';

export type InvitationScope = { schoolId: string } | { organizationId: string };

// The people and invitations of the working campus: people with an active
// membership there, and their invitations.
@Injectable()
export class AccountQueries {
  constructor(
    private readonly dataSource: DataSource,
    private readonly authority: AccountAuthority,
    private readonly roles: RoleQueries,
    private readonly storage: StorageService,
    private readonly clock: Clock,
  ) {}

  async list(
    schoolId: string,
    query: AccountListQueryDto,
  ): Promise<Paginated<AccountDto>> {
    const qb = this.dataSource.manager
      .createQueryBuilder(User, 'user')
      .innerJoinAndMapOne(
        'user.membership',
        SchoolMembership,
        'membership',
        "membership.userId = user.id AND membership.schoolId = :schoolId AND membership.status = 'active'",
        { schoolId },
      );
    if (query.accountStatus) {
      qb.andWhere('user.accountStatus = :status', {
        status: query.accountStatus,
      });
    }
    if (query.search) {
      qb.andWhere('(user.name ILIKE :search OR user.email ILIKE :search)', {
        search: `%${escapeLike(query.search)}%`,
      });
    }
    const page = await paginate(
      qb,
      query,
      {
        name: 'user.name',
        email: 'user.email',
        createdAt: 'user.createdAt',
        joinedAt: 'membership.joinedAt',
      },
      [{ column: 'user.name', direction: 'ASC' }],
    );
    return {
      data: await Promise.all(
        page.data.map((user) => this.summary(user, schoolId)),
      ),
      meta: page.meta,
    };
  }

  async detail(schoolId: string, userId: string): Promise<AccountDetailDto> {
    const user = await this.authority.member(
      this.dataSource.manager,
      userId,
      schoolId,
    );
    const summary = await this.summary(user, schoolId);
    return {
      ...summary,
      birthday: user.birthday,
      gender: user.gender,
      phone: user.phone,
      address: user.address,
      addressLine2: user.addressLine2,
      city: user.city,
      state: user.state,
      postalCode: user.postalCode,
      country: user.country,
      nationality: user.nationality,
      profilePhotoUrl: user.profilePhotoPath
        ? await this.storage.signedUrl(user.profilePhotoPath, {
            expiresInSeconds: PHOTO_URL_SECONDS,
          })
        : null,
    };
  }

  // Invitations of people who work at the campus, with their state.
  // Accepted wins over revoked, and revoked over expired (reference
  // AccountInvitationStatus).
  //
  // The scope is one campus (its active members), or one organization (the
  // active members of any of its campuses; reference
  // AccountInvitationVisibility for organization members).
  async invitations(
    scope: InvitationScope,
    query: InvitationListQueryDto,
  ): Promise<Paginated<AccountInvitationDto>> {
    const now = this.clock.now();
    const qb = this.dataSource.manager
      .createQueryBuilder(AccountInvitation, 'invitation')
      .innerJoinAndSelect('invitation.user', 'user')
      .leftJoinAndSelect('invitation.invitedBy', 'inviter');
    if ('schoolId' in scope) {
      qb.innerJoin(
        SchoolMembership,
        'membership',
        "membership.userId = user.id AND membership.schoolId = :schoolId AND membership.status = 'active'",
        { schoolId: scope.schoolId },
      );
    } else {
      // EXISTS, not a join: a person at two campuses is listed once.
      qb.andWhere(
        `EXISTS (SELECT 1 FROM school_memberships m
                   JOIN schools s ON s.id = m.school_id
                  WHERE m.user_id = invitation.user_id AND m.status = 'active'
                    AND s.organization_id = :organizationId)`,
        { organizationId: scope.organizationId },
      );
    }
    switch (query.status) {
      case 'accepted':
        qb.andWhere('invitation.acceptedAt IS NOT NULL');
        break;
      case 'revoked':
        qb.andWhere(
          'invitation.acceptedAt IS NULL AND invitation.revokedAt IS NOT NULL',
        );
        break;
      case 'expired':
        qb.andWhere(
          'invitation.acceptedAt IS NULL AND invitation.revokedAt IS NULL AND invitation.expiresAt <= :now',
          { now },
        );
        break;
      case 'pending':
        qb.andWhere(
          'invitation.acceptedAt IS NULL AND invitation.revokedAt IS NULL AND invitation.expiresAt > :now',
          { now },
        );
        break;
    }
    if (query.search) {
      qb.andWhere('(user.name ILIKE :search OR user.email ILIKE :search)', {
        search: `%${escapeLike(query.search)}%`,
      });
    }
    const page = await paginate(
      qb,
      query,
      {
        createdAt: 'invitation.createdAt',
        expiresAt: 'invitation.expiresAt',
        name: 'user.name',
      },
      [{ column: 'invitation.createdAt', direction: 'DESC' }],
    );
    return {
      data: page.data.map((invitation) => ({
        id: invitation.id,
        status: invitationStatus(invitation, now),
        user: {
          id: invitation.user.id,
          name: invitation.user.name,
          email: invitation.user.email,
        },
        invitedBy: invitation.invitedBy
          ? { id: invitation.invitedBy.id, name: invitation.invitedBy.name }
          : null,
        expiresAt: invitation.expiresAt,
        acceptedAt: invitation.acceptedAt,
        revokedAt: invitation.revokedAt,
        createdAt: invitation.createdAt,
      })),
      meta: page.meta,
    };
  }

  async summary(
    user: User & { membership?: SchoolMembership },
    schoolId: string,
  ): Promise<AccountDto> {
    const membership =
      user.membership ??
      (await this.dataSource.manager.findOneOrFail(SchoolMembership, {
        where: { userId: user.id, schoolId },
      }));
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      accountStatus: user.accountStatus,
      emailVerifiedAt: user.emailVerifiedAt,
      twoFactorEnabled: user.twoFactorConfirmedAt !== null,
      membership: {
        isPrimary: membership.isPrimary,
        joinedAt: membership.joinedAt,
      },
      roles: await this.roles.heldBy(user.id, schoolId),
      createdAt: user.createdAt,
    };
  }
}

export function invitationStatus(
  invitation: Pick<AccountInvitation, 'acceptedAt' | 'revokedAt' | 'expiresAt'>,
  now: Date,
): InvitationStatus {
  if (invitation.acceptedAt) return 'accepted';
  if (invitation.revokedAt) return 'revoked';
  if (invitation.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'pending';
}
