import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { currentRequest } from '../common/request-context/request-context.js';
import { AuditEvent } from './audit-event.entity.js';

// Action names from the reference's app/Enums/AuditAction.php. Later stages
// add theirs.
export const AuditAction = {
  AccountStatusChanged: 'account.status_changed',
  AccountInvitationSent: 'account_invitation.sent',
  AccountInvitationRevoked: 'account_invitation.revoked',
  AccountPasswordChanged: 'account.password_changed',
} as const;

export type AuditActionName = (typeof AuditAction)[keyof typeof AuditAction];

export interface AuditEntry {
  action: AuditActionName;
  subject?: { type: string; id: string } | null;
  context?: Record<string, unknown>;
  // Defaults to the signed-in user; null for system actions.
  actorId?: string | null;
  // Defaults to the subject's campus or the working campus (Stage 2).
  schoolId?: string | null;
}

// Writes one audit event inside the caller's transaction, so the event is
// saved exactly when the change it describes is.
@Injectable()
export class AuditService {
  async record(manager: EntityManager, entry: AuditEntry): Promise<AuditEvent> {
    const request = currentRequest();
    const event = manager.create(AuditEvent, {
      action: entry.action,
      subjectType: entry.subject?.type ?? null,
      subjectId: entry.subject?.id ?? null,
      context:
        entry.context && Object.keys(entry.context).length
          ? entry.context
          : null,
      actorId:
        entry.actorId === undefined ? (request?.userId ?? null) : entry.actorId,
      schoolId: entry.schoolId ?? null,
      ipAddress: request?.ipAddress ?? null,
    });
    return manager.save(AuditEvent, event);
  }
}
