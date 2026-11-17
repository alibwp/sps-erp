import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource, type EntityManager, type EntityTarget, In } from 'typeorm';
import { Forbidden } from '../access/access.constants.js';
import { isPortalOnly } from '../access/portal-only.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { Clock } from '../common/clock/clock.js';
import { randomToken } from '../common/crypto/app-crypto.service.js';
import { TransactionService } from '../common/database/transaction.service.js';
import {
  RuleViolation,
  ValidationFailed,
} from '../common/errors/api-exception.js';
import { detectFileType } from '../common/files/file-type.js';
import { findInSchool } from '../common/tenancy/school-scope.js';
import { AcademicCycleSection } from '../curriculum/entities/academic-cycle-section.entity.js';
import { AcademicLevel } from '../curriculum/entities/academic-level.entity.js';
import { CourseOffering } from '../curriculum/entities/course-offering.entity.js';
import { StudentRecord } from '../enrollments/entities/student-record.entity.js';
import { School } from '../organizations/entities/school.entity.js';
import { StorageService } from '../storage/storage.service.js';
import { NoticeNotificationPreference } from './entities/notice-notification-preference.entity.js';
import { NoticeRecipient } from './entities/notice-recipient.entity.js';
import { Notice } from './entities/notice.entity.js';
import { noticeText, sanitizeNoticeContent } from './notice-content.js';
import { NoticePublisher } from './notice-publisher.service.js';
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_TYPES,
  EDITABLE_NOTICE,
  NOTICE_SUBJECT,
  type NoticeAudienceSpec,
  type NoticeStatus,
  canMoveNotice,
} from './notices.constants.js';

export const NOTICE_NOT_FOUND = 'Notice not found.';

export const NoticeMessages = {
  notEditable: 'Only a draft or scheduled notice can be changed.',
  onlyPublishedRevised: 'Only a published notice can be revised.',
  notDeletable: 'Only a draft that was never published can be deleted.',
  cannotArchive: 'This notice cannot be archived from its current state.',
  notScheduled: 'Only a scheduled notice can go back to draft.',
  stopBeforeStart: 'The until field must be a date after or equal to from.',
  noContent: 'Write the message.',
  noLevels: 'Choose at least one class or level.',
  noSections: 'Choose at least one section.',
  noOfferings: 'Choose at least one subject.',
  scheduleInPast: 'The scheduled for field must be a date after now.',
  attachmentType:
    'The attachment field must be a file of type: jpeg, png, jpg, gif, pdf, doc, docx.',
  attachmentSize:
    'The attachment field must not be greater than 10240 kilobytes.',
  attachmentRequired: 'The attachment field is required.',
  audienceIds: (field: string) => `The selected ${field} is invalid.`,
} as const;

export interface NoticeInput {
  title?: string;
  content?: string;
  startDate?: string;
  stopDate?: string;
  sendEmail?: boolean;
  audience?: NoticeAudienceSpec;
}

export interface Reader {
  id: string;
  permissions: ReadonlySet<string>;
}

// The notices of a campus (reference NoticeService, ReviseNotice,
// NoticePolicy, NoticeAttachmentController). Drafts and scheduled notices
// can be changed; a published one is revised (a new draft) or archived,
// never deleted.
@Injectable()
export class Notices {
  private readonly logger = new Logger(Notices.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly transactions: TransactionService,
    private readonly publisher: NoticePublisher,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  // What a reader sees: everything with "update notice" or "delete
  // notice"; published notices with "read notice"; only the notices they
  // received when they hold nothing but the parent or student role.
  async list(
    schoolId: string,
    reader: Reader,
    filter: { status?: NoticeStatus } = {},
  ): Promise<Notice[]> {
    const query = this.dataSource.manager
      .createQueryBuilder(Notice, 'notice')
      .where('notice.schoolId = :schoolId', { schoolId })
      .orderBy('notice.createdAt', 'DESC');
    if (filter.status) {
      query.andWhere('notice.status = :status', { status: filter.status });
    }
    if (await isPortalOnly(this.dataSource.manager, reader.id, schoolId)) {
      query
        .andWhere("notice.status = 'published'")
        .andWhere(
          'EXISTS (SELECT 1 FROM notice_recipients r WHERE r.notice_id = notice.id AND r.user_id = :readerId)',
          { readerId: reader.id },
        );
    } else if (!this.mayManage(reader)) {
      query.andWhere("notice.status = 'published'");
    }
    return query.getMany();
  }

  async find(
    schoolId: string,
    id: string,
    reader: Reader,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<Notice> {
    const notice = await this.noticeHere(manager, schoolId, id);
    if (!(await this.mayRead(manager, notice, reader))) throw new Forbidden();
    return notice;
  }

  async create(
    actorId: string,
    schoolId: string,
    input: NoticeInput & {
      title: string;
      content: string;
      startDate: string;
      stopDate: string;
      audience: NoticeAudienceSpec;
    },
  ): Promise<Notice> {
    this.mustEndAfterStart(input.startDate, input.stopDate);
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      await this.mustBeAudienceOfCampus(manager, schoolId, input.audience);
      return manager.save(
        manager.create(Notice, {
          schoolId,
          title: input.title.trim(),
          content: this.content(input.content),
          status: 'draft',
          audience: normaliseAudience(input.audience),
          sendEmail: input.sendEmail ?? false,
          startDate: input.startDate,
          stopDate: input.stopDate,
          revision: 1,
          createdById: actorId,
        }),
      );
    });
  }

  async update(
    schoolId: string,
    id: string,
    input: NoticeInput,
  ): Promise<Notice> {
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const notice = await this.noticeHere(manager, schoolId, id, true);
      this.mustBeEditable(notice);
      await this.apply(manager, notice, input);
      return manager.save(notice);
    });
  }

  // A draft that was never published is deleted with its file; anything
  // else is archived instead, so its history stays.
  async remove(schoolId: string, id: string): Promise<void> {
    const key = await this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const notice = await this.noticeHere(manager, schoolId, id, true);
      if (notice.status !== 'draft' || notice.publishedAt !== null) {
        throw new RuleViolation(NoticeMessages.notDeletable);
      }
      await manager.remove(notice);
      return notice.attachmentKey;
    });
    await this.deleteFileIfUnused(key);
  }

  publish(actorId: string, schoolId: string, id: string): Promise<Notice> {
    return this.inCampus(schoolId, id, () =>
      this.publisher.publish(id, actorId),
    );
  }

  schedule(
    actorId: string,
    schoolId: string,
    id: string,
    when: Date,
  ): Promise<Notice> {
    if (when.getTime() <= this.clock.now().getTime()) {
      throw new ValidationFailed({
        scheduledFor: [NoticeMessages.scheduleInPast],
      });
    }
    return this.inCampus(schoolId, id, () =>
      this.publisher.schedule(id, when, actorId),
    );
  }

  async unschedule(schoolId: string, id: string): Promise<Notice> {
    return this.transactions.run(async (tx) => {
      const notice = await this.noticeHere(tx.manager, schoolId, id, true);
      if (notice.status !== 'scheduled') {
        throw new RuleViolation(NoticeMessages.notScheduled);
      }
      notice.status = 'draft';
      notice.scheduledFor = null;
      return tx.manager.save(notice);
    });
  }

  // A published notice gets a new draft revision with the changes; the
  // attachment comes along unless the revision replaces or removes it.
  async revise(
    actorId: string,
    schoolId: string,
    id: string,
    changes: NoticeInput,
  ): Promise<Notice> {
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const notice = await this.noticeHere(manager, schoolId, id, true);
      if (notice.status !== 'published') {
        throw new RuleViolation(NoticeMessages.onlyPublishedRevised);
      }
      const revision = manager.create(Notice, {
        schoolId,
        title: notice.title,
        content: notice.content,
        status: 'draft',
        audience: notice.audience,
        sendEmail: notice.sendEmail,
        startDate: notice.startDate,
        stopDate: notice.stopDate,
        revision: notice.revision + 1,
        revisionOfId: notice.id,
        attachmentKey: notice.attachmentKey,
        attachmentName: notice.attachmentName,
        attachmentMimeType: notice.attachmentMimeType,
        attachmentSize: notice.attachmentSize,
        createdById: actorId,
      });
      await this.apply(manager, revision, changes);
      const saved = await manager.save(revision);
      await this.audit.record(manager, {
        action: AuditAction.NoticeRevised,
        subject: { type: NOTICE_SUBJECT, id: saved.id },
        context: { revision: saved.revision, revision_of_id: notice.id },
        schoolId,
      });
      return saved;
    });
  }

  async archive(schoolId: string, id: string): Promise<Notice> {
    return this.transactions.run(async (tx) => {
      const notice = await this.noticeHere(tx.manager, schoolId, id, true);
      if (notice.status === 'archived') return notice;
      if (!canMoveNotice(notice.status, 'archived')) {
        throw new RuleViolation(NoticeMessages.cannotArchive);
      }
      notice.status = 'archived';
      return tx.manager.save(notice);
    });
  }

  // jpg, png, gif, pdf, doc or docx (checked by content), at most 10 MB,
  // kept by the storage service. The file it replaces goes unless another
  // revision still uses it.
  async setAttachment(
    schoolId: string,
    id: string,
    file: { buffer: Buffer; originalname?: string } | undefined,
  ): Promise<Notice> {
    if (!file?.buffer?.length) {
      throw new ValidationFailed({
        attachment: [NoticeMessages.attachmentRequired],
      });
    }
    if (file.buffer.length > ATTACHMENT_MAX_BYTES) {
      throw new ValidationFailed({
        attachment: [NoticeMessages.attachmentSize],
      });
    }
    const type = detectFileType(file.buffer, ATTACHMENT_TYPES);
    if (!type) {
      throw new ValidationFailed({
        attachment: [NoticeMessages.attachmentType],
      });
    }
    this.mustBeEditable(
      await this.noticeHere(this.dataSource.manager, schoolId, id),
    );
    const key = `notices/${schoolId}/${id}-${randomToken(12)}.${type.extension}`;
    await this.storage.put(key, file.buffer, { contentType: type.mime });
    let replaced: string | null = null;
    try {
      const notice = await this.transactions.run(async (tx) => {
        const current = await this.noticeHere(tx.manager, schoolId, id, true);
        this.mustBeEditable(current);
        replaced = current.attachmentKey;
        current.attachmentKey = key;
        current.attachmentName = cleanName(file.originalname, type.extension);
        current.attachmentMimeType = type.mime;
        current.attachmentSize = file.buffer.length;
        return tx.manager.save(current);
      });
      await this.deleteFileIfUnused(replaced);
      return notice;
    } catch (error) {
      await this.deleteFileIfUnused(key);
      throw error;
    }
  }

  async removeAttachment(schoolId: string, id: string): Promise<Notice> {
    let removed: string | null = null;
    const notice = await this.transactions.run(async (tx) => {
      const current = await this.noticeHere(tx.manager, schoolId, id, true);
      this.mustBeEditable(current);
      removed = current.attachmentKey;
      current.attachmentKey = null;
      current.attachmentName = null;
      current.attachmentMimeType = null;
      current.attachmentSize = null;
      return tx.manager.save(current);
    });
    await this.deleteFileIfUnused(removed);
    return notice;
  }

  // The attachment, for a recipient of the notice or a reader of notices.
  async attachment(
    schoolId: string,
    id: string,
    reader: Reader,
  ): Promise<{ content: Buffer; name: string; mimeType: string }> {
    const manager = this.dataSource.manager;
    const notice = await this.noticeHere(manager, schoolId, id);
    const recipient = await manager.exists(NoticeRecipient, {
      where: { noticeId: notice.id, userId: reader.id },
    });
    if (!recipient && !(await this.mayRead(manager, notice, reader))) {
      throw new Forbidden();
    }
    if (!notice.attachmentKey) {
      throw new NotFoundException('This notice has no attachment.');
    }
    return {
      content: await this.storage.get(notice.attachmentKey),
      name: notice.attachmentName ?? 'notice-attachment',
      mimeType: notice.attachmentMimeType ?? 'application/octet-stream',
    };
  }

  // Who a notice reached and how delivery went (failed with the reason).
  async recipients(schoolId: string, id: string): Promise<NoticeRecipient[]> {
    const notice = await this.noticeHere(this.dataSource.manager, schoolId, id);
    return this.dataSource.manager.find(NoticeRecipient, {
      where: { noticeId: notice.id },
      relations: { user: true },
      withDeleted: true,
      order: { createdAt: 'ASC' },
    });
  }

  // ---------- The reader's own notices ----------

  // Published notices the person received at this campus that have
  // started, newest first; dismissed ones only when asked for.
  async mine(
    school: School,
    userId: string,
    includeDismissed: boolean,
  ): Promise<Array<{ notice: Notice; recipient: NoticeRecipient }>> {
    const today = this.clock.schoolToday(school.timezone);
    const rows = await this.dataSource.manager
      .createQueryBuilder(NoticeRecipient, 'recipient')
      .innerJoinAndSelect('recipient.notice', 'notice')
      .where('recipient.userId = :userId', { userId })
      .andWhere('notice.schoolId = :schoolId', { schoolId: school.id })
      .andWhere("notice.status = 'published'")
      .andWhere('notice.startDate <= :today', { today })
      .andWhere(includeDismissed ? 'TRUE' : "recipient.state <> 'dismissed'")
      .orderBy('notice.publishedAt', 'DESC')
      .getMany();
    return rows.map((recipient) => ({ notice: recipient.notice, recipient }));
  }

  markRead(
    schoolId: string,
    userId: string,
    noticeId: string,
  ): Promise<NoticeRecipient> {
    // As the reference's NoticeRecipient::markRead: reading a dismissed
    // notice brings it back; reading it again changes nothing.
    return this.mark(schoolId, userId, noticeId, (recipient, now) => {
      if (recipient.state === 'read') return;
      recipient.state = 'read';
      recipient.readAt = now;
    });
  }

  dismiss(
    schoolId: string,
    userId: string,
    noticeId: string,
  ): Promise<NoticeRecipient> {
    return this.mark(schoolId, userId, noticeId, (recipient, now) => {
      recipient.dismissedAt = now;
      recipient.state = 'dismissed';
    });
  }

  // ---------- Email preferences ----------

  async emailEnabled(userId: string, schoolId: string): Promise<boolean> {
    const preference = await this.dataSource.manager.findOne(
      NoticeNotificationPreference,
      { where: { userId, schoolId } },
    );
    return preference?.emailEnabled ?? true;
  }

  async setEmailEnabled(
    userId: string,
    schoolId: string,
    enabled: boolean,
  ): Promise<boolean> {
    await this.dataSource.manager.query(
      `INSERT INTO notice_notification_preferences (user_id, school_id, email_enabled)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, school_id)
       DO UPDATE SET email_enabled = EXCLUDED.email_enabled, updated_at = now()`,
      [userId, schoolId, enabled],
    );
    return enabled;
  }

  // ---------- Inside ----------

  private async mark(
    schoolId: string,
    userId: string,
    noticeId: string,
    change: (recipient: NoticeRecipient, now: Date) => void,
  ): Promise<NoticeRecipient> {
    return this.transactions.run(async (tx) => {
      const recipient = await tx.manager
        .createQueryBuilder(NoticeRecipient, 'recipient')
        .innerJoin('recipient.notice', 'notice')
        .where('recipient.noticeId = :noticeId', { noticeId })
        .andWhere('recipient.userId = :userId', { userId })
        .andWhere('notice.schoolId = :schoolId', { schoolId })
        .setLock('pessimistic_write', undefined, ['recipient'])
        .getOne();
      if (!recipient) throw new NotFoundException(NOTICE_NOT_FOUND);
      change(recipient, this.clock.now());
      return tx.manager.save(recipient);
    });
  }

  private async apply(
    manager: EntityManager,
    notice: Notice,
    input: NoticeInput,
  ): Promise<void> {
    if (input.title !== undefined) notice.title = input.title.trim();
    if (input.content !== undefined) {
      notice.content = this.content(input.content);
    }
    if (input.sendEmail !== undefined) notice.sendEmail = input.sendEmail;
    const startDate = input.startDate ?? notice.startDate;
    const stopDate = input.stopDate ?? notice.stopDate;
    this.mustEndAfterStart(startDate, stopDate);
    notice.startDate = startDate;
    notice.stopDate = stopDate;
    if (input.audience !== undefined) {
      await this.mustBeAudienceOfCampus(
        manager,
        notice.schoolId,
        input.audience,
      );
      notice.audience = normaliseAudience(input.audience);
    }
  }

  private async mayRead(
    manager: EntityManager,
    notice: Notice,
    reader: Reader,
  ): Promise<boolean> {
    if (!reader.permissions.has('read notice')) return false;
    if (await isPortalOnly(manager, reader.id, notice.schoolId)) {
      return (
        notice.status === 'published' &&
        (await manager.exists(NoticeRecipient, {
          where: { noticeId: notice.id, userId: reader.id },
        }))
      );
    }
    return notice.status === 'published' || this.mayManage(reader);
  }

  private mayManage(reader: Reader): boolean {
    return (
      reader.permissions.has('update notice') ||
      reader.permissions.has('delete notice')
    );
  }

  // Safe HTML with words in it; markup alone (an empty paragraph) is not a
  // message.
  private content(raw: string): string {
    const html = sanitizeNoticeContent(raw);
    if (!noticeText(html).trim()) {
      throw new ValidationFailed({ content: [NoticeMessages.noContent] });
    }
    return html;
  }

  private mustBeEditable(notice: Notice): void {
    if (!EDITABLE_NOTICE.includes(notice.status)) {
      throw new RuleViolation(NoticeMessages.notEditable);
    }
  }

  private mustEndAfterStart(startDate: string, stopDate: string): void {
    if (stopDate < startDate) {
      throw new ValidationFailed({
        stopDate: [NoticeMessages.stopBeforeStart],
      });
    }
  }

  // The chosen levels, sections, offerings and enrollments must be this
  // campus's.
  private async mustBeAudienceOfCampus(
    manager: EntityManager,
    schoolId: string,
    audience: NoticeAudienceSpec,
  ): Promise<void> {
    const required = {
      class: [
        'academicLevelIds',
        audience.academicLevelIds,
        NoticeMessages.noLevels,
      ],
      section: ['sectionIds', audience.sectionIds, NoticeMessages.noSections],
      offering: [
        'courseOfferingIds',
        audience.courseOfferingIds,
        NoticeMessages.noOfferings,
      ],
    } as const;
    if (audience.scope !== 'school') {
      const [field, list, message] = required[audience.scope];
      if (!list?.length) {
        throw new ValidationFailed({ [`audience.${field}`]: [message] });
      }
    }
    const checks: Array<
      [string, string, string[] | undefined, EntityTarget<CampusRow>]
    > = [
      ['academicLevelIds', 'level', audience.academicLevelIds, AcademicLevel],
      ['sectionIds', 'section', audience.sectionIds, AcademicCycleSection],
      [
        'courseOfferingIds',
        'offering',
        audience.courseOfferingIds,
        CourseOffering,
      ],
      ['studentIds', 'student', audience.studentIds, StudentRecord],
    ];
    for (const [field, label, list, entity] of checks) {
      const wanted = [...new Set(list ?? [])];
      if (!wanted.length) continue;
      const found = await manager.count(entity, {
        where: { id: In(wanted), schoolId },
      });
      if (found !== wanted.length) {
        throw new ValidationFailed({
          [`audience.${field}`]: [NoticeMessages.audienceIds(label)],
        });
      }
    }
  }

  private async inCampus<T>(
    schoolId: string,
    id: string,
    work: () => Promise<T>,
  ): Promise<T> {
    await this.noticeHere(this.dataSource.manager, schoolId, id);
    return work();
  }

  private noticeHere(
    manager: EntityManager,
    schoolId: string,
    id: string,
    lock = false,
  ): Promise<Notice> {
    return findInSchool(
      manager,
      Notice,
      { id },
      { schoolId, lock, notFound: NOTICE_NOT_FOUND },
    );
  }

  // Revisions share their original's file, so it goes only when no notice
  // uses it any more.
  private async deleteFileIfUnused(key: string | null): Promise<void> {
    if (!key) return;
    const used = await this.dataSource.manager.exists(Notice, {
      where: { attachmentKey: key },
    });
    if (used) return;
    try {
      await this.storage.delete(key);
    } catch (error) {
      this.logger.warn(
        `Notice attachment ${key} not deleted: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

interface CampusRow {
  id: string;
  schoolId: string;
}

function normaliseAudience(audience: NoticeAudienceSpec): NoticeAudienceSpec {
  const unique = (list?: string[]) => [...new Set(list ?? [])];
  return {
    scope: audience.scope,
    academicLevelIds:
      audience.scope === 'class' ? unique(audience.academicLevelIds) : [],
    sectionIds: audience.scope === 'section' ? unique(audience.sectionIds) : [],
    courseOfferingIds:
      audience.scope === 'offering' ? unique(audience.courseOfferingIds) : [],
    studentIds: unique(audience.studentIds),
    userIds: unique(audience.userIds),
    roles: unique(audience.roles),
    includeGuardians: audience.includeGuardians ?? false,
  };
}

// The name the file came with, or a plain one; never a path.
function cleanName(name: string | undefined, extension: string): string {
  const base = (name ?? '').split(/[\\/]/).pop()?.trim().slice(0, 200) ?? '';
  return base || `attachment.${extension}`;
}
