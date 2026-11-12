import { Logger } from '@nestjs/common';

const REPEAT_AFTER_MS = 60_000;

// BullMQ prints connection errors to the console (not as JSON) when a queue
// or worker has no 'error' listener. This listener sends them through the
// app logger instead, and repeats the same message at most once a minute,
// so an outage does not flood the log.
export function queueErrorListener(
  source: string,
  logger = new Logger('Queue'),
  now = () => Date.now(),
): (error: Error) => void {
  const lastLogged = new Map<string, number>();
  return (error: Error) => {
    const at = lastLogged.get(error.message);
    if (at !== undefined && now() - at < REPEAT_AFTER_MS) return;
    lastLogged.set(error.message, now());
    logger.warn(`${source}: ${error.message}`);
  };
}
