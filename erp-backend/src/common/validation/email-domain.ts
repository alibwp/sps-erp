import { Resolver } from 'node:dns/promises';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// The parts of node:dns/promises Resolver this uses (replaceable in tests).
export interface DnsResolver {
  resolveMx(hostname: string): Promise<unknown[]>;
  resolve4(hostname: string): Promise<unknown[]>;
  resolve6(hostname: string): Promise<unknown[]>;
}

export const EMAIL_DOMAIN_TIMEOUT_MS = 3000;

// The reference's `email:dns` rule (config identity.check_email_domains):
// refuse a new address whose domain cannot receive mail, which catches
// typing mistakes such as "gmial.com". Used wherever an address is set or
// changed (own profile now, people's details in Stage 5).
//
// It refuses only when DNS clearly answers that the domain has no MX, A or
// AAAA record. A timeout or a failing resolver accepts the address and logs
// a warning: a DNS outage must not block anyone. It uses the c-ares
// resolver, not dns.lookup, so it never occupies Node's worker threads.
@Injectable()
export class EmailDomainChecker {
  private readonly logger = new Logger(EmailDomainChecker.name);
  private readonly enabled: boolean;
  resolver: DnsResolver = new Resolver({
    timeout: EMAIL_DOMAIN_TIMEOUT_MS,
    tries: 1,
  });

  constructor(config: ConfigService) {
    this.enabled = config.get('CHECK_EMAIL_DOMAINS', 'true') !== 'false';
  }

  // True unless the domain definitely cannot receive mail.
  async canReceiveMail(email: string): Promise<boolean> {
    if (!this.enabled) return true;
    const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase();
    if (!domain) return false;

    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), EMAIL_DOMAIN_TIMEOUT_MS);
    });
    try {
      const result = await Promise.race([this.hasMailRecords(domain), timeout]);
      if (result === 'timeout') {
        this.logger.warn(
          `Email domain check timed out for ${domain}; address accepted`,
        );
        return true;
      }
      return result;
    } catch (error) {
      this.logger.warn(
        `Email domain check failed for ${domain}; address accepted: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return true;
    } finally {
      clearTimeout(timer);
    }
  }

  // MX first, then A, then AAAA. "No such domain" ends the search with
  // false; "no records of this type" moves on; anything else is a resolver
  // failure and is thrown.
  private async hasMailRecords(domain: string): Promise<boolean> {
    const lookups = [
      () => this.resolver.resolveMx(domain),
      () => this.resolver.resolve4(domain),
      () => this.resolver.resolve6(domain),
    ];
    for (const lookup of lookups) {
      try {
        if ((await lookup()).length > 0) return true;
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === 'ENOTFOUND') return false;
        if (code !== 'ENODATA') throw error;
      }
    }
    return false;
  }
}
