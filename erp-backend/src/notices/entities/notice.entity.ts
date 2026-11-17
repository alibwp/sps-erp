import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '../../common/database/base-entity.js';
import { SchoolOwned } from '../../common/tenancy/school-scope.js';
import { User } from '../../identity/entities/user.entity.js';
import { School } from '../../organizations/entities/school.entity.js';
import type { NoticeAudienceSpec, NoticeStatus } from '../notices.constants.js';

// A notice to a campus's people (reference Notice). The content is stored
// sanitized. Publishing resolves the audience once into notice_recipients;
// a revision is a new draft that supersedes its original when published.
@SchoolOwned()
@Entity({ name: 'notices' })
@Index('notices_school_status_index', ['schoolId', 'status'])
@Index('notices_status_scheduled_index', ['status', 'scheduledFor'])
@Check(
  'notices_status_valid',
  "status IN ('draft', 'scheduled', 'published', 'expired', 'superseded', 'archived')",
)
@Check('notices_stop_after_start', 'stop_date >= start_date')
export class Notice extends AppBaseEntity {
  @Column({ type: 'uuid' })
  schoolId: string;

  @ManyToOne(() => School, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'school_id' })
  school: School;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: NoticeStatus;

  @Column({ type: 'jsonb' })
  audience: NoticeAudienceSpec;

  @Column({ type: 'boolean', default: false })
  sendEmail: boolean;

  @Column({ type: 'date' })
  startDate: string;

  @Column({ type: 'date' })
  stopDate: string;

  @Column({ type: 'timestamptz', nullable: true })
  scheduledFor: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ name: 'published_by', type: 'uuid', nullable: true })
  publishedById: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'published_by' })
  publishedBy: User | null;

  @Column({ type: 'smallint', default: 1 })
  revision: number;

  @Column({ type: 'uuid', nullable: true })
  revisionOfId: string | null;

  @ManyToOne(() => Notice, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'revision_of_id' })
  revisionOf: Notice | null;

  // The managed attachment: where the storage service keeps it, and what
  // it was when it came in. A revision shares its original's file.
  @Column({ type: 'varchar', length: 1024, nullable: true })
  attachmentKey: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  attachmentName: string | null;

  @Column({ type: 'varchar', length: 127, nullable: true })
  attachmentMimeType: string | null;

  @Column({ type: 'integer', nullable: true })
  attachmentSize: number | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdById: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy: User | null;
}
