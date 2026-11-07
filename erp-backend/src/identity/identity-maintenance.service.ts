import { Injectable, Logger } from '@nestjs/common';
import { SessionService } from './auth/session.service.js';
import { InvitationService } from './invitations/invitation.service.js';

// The hourly identity job (scheduled job "prune-expired-invitations").
@Injectable()
export class IdentityMaintenance {
  private readonly logger = new Logger(IdentityMaintenance.name);

  constructor(
    private readonly invitations: InvitationService,
    private readonly sessions: SessionService,
  ) {}

  async pruneExpired(): Promise<{
    invitations: number;
    pendingSessions: number;
  }> {
    const invitations = await this.invitations.revokeExpired();
    const pendingSessions = await this.sessions.deleteStalePending();
    if (pendingSessions > 0) {
      this.logger.log(
        `Deleted ${pendingSessions} unanswered two-factor sign-ins.`,
      );
    }
    return { invitations, pendingSessions };
  }
}
