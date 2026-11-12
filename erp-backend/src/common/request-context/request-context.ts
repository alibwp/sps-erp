import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

// What the code handling a request may need without passing it down every
// call: who is signed in and where the request came from (for the audit
// log). Outside a request (jobs, CLI) there is no context.
export interface RequestContext {
  ipAddress: string | null;
  userId: string | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function currentRequest(): RequestContext | undefined {
  return storage.getStore();
}

// Runs fn with a context, for tests and jobs that act for someone.
export function runWithRequestContext<T>(
  context: RequestContext,
  fn: () => T,
): T {
  return storage.run(context, fn);
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    storage.run({ ipAddress: req.ip ?? null, userId: null }, next);
  }
}
