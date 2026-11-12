import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { AccountAuthority } from './account-authority.service.js';
import { AccountQueries } from './account-queries.service.js';
import {
  AccountInvitationsController,
  AccountsController,
  OrganizationInvitationsController,
} from './accounts.controller.js';
import { Accounts } from './accounts.service.js';

// Stage 2: account administration at the working campus ("manage account
// access"): provisioning, status, invitations, campus membership and roles;
// and the invitations of an organization's people for its member managers.
@Module({
  imports: [AccessModule, OrganizationsModule, IdentityModule],
  controllers: [
    AccountsController,
    AccountInvitationsController,
    OrganizationInvitationsController,
  ],
  providers: [AccountAuthority, AccountQueries, Accounts],
  exports: [AccountAuthority, Accounts],
})
export class AccountsModule {}
