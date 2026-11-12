import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// The reference's "api" limiter: 60 requests a minute per signed-in user,
// or per IP address for anonymous requests.
export const API_RATE_LIMIT = { name: 'default', ttl: 60_000, limit: 60 };

// Global guard 3 of 3: runs after authentication, so signed-in requests
// are counted by user, not by IP.
@Injectable()
export class UserOrIpThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(
    req: Record<string, any>,
  ): Promise<string> {
    const userId = req.user?.id;
    return userId ? `user:${userId}` : `ip:${req.ip}`;
  }

  // One budget per user or IP across all routes, like Laravel's limiter.
  // (The library default adds the route to the key, which would give 60 a
  // minute per route.) Routes with their own limit use their own tracker,
  // such as "login:<email>|<ip>", so their counts stay separate.
  protected override generateKey(
    _context: ExecutionContext,
    tracker: string,
    throttlerName: string,
  ): string {
    return `${throttlerName}:${tracker}`;
  }
}
