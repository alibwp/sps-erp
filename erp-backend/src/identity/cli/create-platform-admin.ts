import type { INestApplicationContext } from '@nestjs/common';
import { isEmail } from 'class-validator';
import { DataSource } from 'typeorm';
import { User } from '../entities/user.entity.js';
import { normalizeEmail } from '../identity.constants.js';
import { InvitationService } from '../invitations/invitation.service.js';

export interface CreatePlatformAdminInput {
  name?: string;
  email?: string;
}

export class CliError extends Error {}

// `create-platform-admin --name --email`: creates the account and returns a
// one-time invitation link to print. There is never a default password.
// Stage 2 adds the platform-admin role grant to this command. Running it
// again for an account still waiting on its invitation prints a new link
// (the old one stops working). No email is sent.
export async function createPlatformAdmin(
  app: INestApplicationContext,
  input: CreatePlatformAdminInput,
): Promise<{ userId: string; link: string; expiresAt: Date }> {
  const name = input.name?.trim() ?? '';
  const email = normalizeEmail(input.email ?? '');
  if (!name || name.length > 100)
    throw new CliError('--name is required (at most 100 characters).');
  if (!isEmail(email) || email.length > 100)
    throw new CliError('--email must be a valid email address.');

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

  const user =
    existing ??
    (await dataSource.manager.save(
      dataSource.manager.create(User, {
        name,
        email,
        accountStatus: 'invited',
      }),
    ));
  const sent = await app
    .get(InvitationService)
    .send(user.id, { invitedById: null, notify: false });
  return {
    userId: user.id,
    link: sent.link,
    expiresAt: sent.invitation.expiresAt,
  };
}
