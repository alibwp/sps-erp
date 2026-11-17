import type { FileExtension } from '../common/files/file-type.js';

// Notices (Stage 7; reference NoticeStatus, NoticeRecipientState,
// NoticeAudienceScope).

export const NOTICE_STATUSES = [
  'draft',
  'scheduled',
  'published',
  'expired',
  'superseded',
  'archived',
] as const;
export type NoticeStatus = (typeof NOTICE_STATUSES)[number];

const NOTICE_NEXT: Record<NoticeStatus, readonly NoticeStatus[]> = {
  draft: ['scheduled', 'published', 'archived'],
  scheduled: ['published', 'draft', 'archived'],
  published: ['expired', 'superseded', 'archived'],
  expired: ['archived'],
  superseded: [],
  archived: [],
};

export function canMoveNotice(from: NoticeStatus, to: NoticeStatus): boolean {
  return NOTICE_NEXT[from].includes(to);
}

// A notice whose content may still change.
export const EDITABLE_NOTICE: readonly NoticeStatus[] = ['draft', 'scheduled'];

export const RECIPIENT_STATES = [
  'pending',
  'delivered',
  'read',
  'dismissed',
  'failed',
] as const;
export type RecipientState = (typeof RECIPIENT_STATES)[number];

// Who a notice is for: the whole campus, or the learners of chosen levels
// ("class"), sections or course offerings.
export const AUDIENCE_SCOPES = [
  'school',
  'class',
  'section',
  'offering',
] as const;
export type AudienceScope = (typeof AUDIENCE_SCOPES)[number];

export interface NoticeAudienceSpec {
  scope: AudienceScope;
  academicLevelIds?: string[];
  sectionIds?: string[];
  courseOfferingIds?: string[];
  // Enrollments named one by one.
  studentIds?: string[];
  // People named one by one; only those who belong to the campus count.
  userIds?: string[];
  // Keeps only the people holding one of these roles.
  roles?: string[];
  includeGuardians?: boolean;
}

export const ATTACHMENT_TYPES: readonly FileExtension[] = [
  'jpg',
  'png',
  'gif',
  'pdf',
  'doc',
  'docx',
];
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

export const NOTICE_SUBJECT = 'notice';
export const SEND_NOTICE_EMAILS_JOB = 'send-notice-emails';
