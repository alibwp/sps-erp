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
];
