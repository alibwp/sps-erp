import { QUEUES } from '../queue/queue.module.js';

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

// One entry per recurring job. The id is fixed, so registering the list
// again (every start, every instance) updates the job instead of adding a
// second copy.
export interface ScheduledJob {
  id: string;
  queue: QueueName;
  // Either a fixed interval in milliseconds or a cron pattern.
  every?: number;
  pattern?: string;
  // Time zone for `pattern`; defaults to UTC.
  tz?: string;
}

export const QUEUE_HEARTBEAT_JOB = 'queue-heartbeat';
export const PRUNE_INVITATIONS_JOB = 'prune-expired-invitations';
export const OPEN_ACADEMIC_PERIODS_JOB = 'open-academic-periods';
export const GENERATE_ACADEMIC_CYCLES_JOB = 'generate-academic-cycles';
export const ACADEMIC_CALENDAR_REMINDERS_JOB = 'academic-calendar-reminders';

export const SCHEDULED_JOBS: ScheduledJob[] = [
  // Taken off the queue by a worker; a stale heartbeat means no worker runs.
  { id: QUEUE_HEARTBEAT_JOB, queue: QUEUES.maintenance, every: 60_000 },
  // Hourly, as the reference schedules PruneExpiredInvitations: expired
  // invitations are revoked and unanswered two-factor sign-ins deleted.
  {
    id: PRUNE_INVITATIONS_JOB,
    queue: QUEUES.maintenance,
    pattern: '0 * * * *',
  },
  // Hourly rather than daily: each campus has its own today, so a
  // scheduled year or period opens within an hour of local midnight.
  {
    id: OPEN_ACADEMIC_PERIODS_JOB,
    queue: QUEUES.maintenance,
    pattern: '30 * * * *',
  },
  // Mondays 01:00: draft the next cycle where the current one ends soon.
  {
    id: GENERATE_ACADEMIC_CYCLES_JOB,
    queue: QUEUES.maintenance,
    pattern: '0 1 * * 1',
  },
  // Daily 07:15: staff reminders before a period starts or ends, and for
  // a finished period still open.
  {
    id: ACADEMIC_CALENDAR_REMINDERS_JOB,
    queue: QUEUES.maintenance,
    pattern: '15 7 * * *',
  },
];
