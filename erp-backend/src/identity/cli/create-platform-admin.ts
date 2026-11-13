import type { INestApplicationContext } from '@nestjs/common';
import { isEmail } from 'class-validator';
import { DataSource } from 'typeorm';
import { BuiltInRole } from '../../access/access.constants.js';
import { RoleAssignments } from '../../access/role-assignments.service.js';
import { TransactionService } from '../../common/database/transaction.service.js';
import { User } from '../entities/user.entity.js';
import { normalizeEmail } from '../identity.constants.js';
import { InvitationService } from '../invitations/invitation.service.js';

export interface CreatePlatformAdminInput {
  name?: string;
  email?: string;
}

export class CliError extends Error {}

export function checkName(value: string | undefined, option: string): string {
  const name = value?.trim() ?? '';
  if (!name || name.length > 100)
    throw new CliError(`${option} is required (at most 100 characters).`);
  return name;
}

export function checkEmail(value: string | undefined, option: string): string {
  const email = normalizeEmail(value ?? '');
  if (!isEmail(email) || email.length > 100)
    throw new CliError(`${option} must be a valid email address.`);
  return email;
}

// `create-platform-admin --name --email`: creates the account, gives it the
// global platform-admin role and returns a one-time invitation link to
// print. There is never a default password. Running it again for an
// account still waiting on its invitation prints a new link (the old one
// stops working). No email is sent.
export async function createPlatformAdmin(
  app: INestApplicationContext,
  input: CreatePlatformAdminInput,
): Promise<{ userId: string; link: string; expiresAt: Date }> {
  const name = checkName(input.name, '--name');
  const email = checkEmail(input.email, '--email');

  const dataSource = app.get(DataSource);
  const existing = await dataSource.manager.findOne(User, {
    where: { email },
    withDeleted: true,
  });
  if (
    existing &&
    (existing.passwordHash !== null ||
      existing.deletedAt ||
      existing.accountStatus !== 'invited')
  ) {
    throw new CliError('An account with this email already exists.');
  }

  const user = await app.get(TransactionService).run(async (tx) => {
    const account =
      existing ??
      (await tx.manager.save(
        tx.manager.create(User, { name, email, accountStatus: 'invited' }),
      ));
    await app
      .get(RoleAssignments)
      .grantGlobal(tx.manager, account.id, BuiltInRole.PlatformAdmin, null);
    return account;
  });
  const sent = await app
    .get(InvitationService)
    .send(user.id, { invitedById: null, notify: false });
  return {
    userId: user.id,
    link: sent.link,
    expiresAt: sent.invitation.expiresAt,
  };
}
