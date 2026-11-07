import { ConfigService } from '@nestjs/config';
import { EMAIL_DOMAIN_TIMEOUT_MS, EmailDomainChecker } from './email-domain.js';

const dnsError = (code: string) => Object.assign(new Error(code), { code });

function checker(
  records: { mx?: unknown; a?: unknown; aaaa?: unknown },
  enabled = 'true',
) {
  const result = (value: unknown) => async () => {
    if (value instanceof Error) throw value;
    if (value === 'hang') return new Promise<unknown[]>(() => undefined);
    return (value ?? []) as unknown[];
  };
  const instance = new EmailDomainChecker(
    new ConfigService({ CHECK_EMAIL_DOMAINS: enabled }),
  );
  instance.resolver = {
    resolveMx: vi.fn(result(records.mx ?? dnsError('ENODATA'))),
    resolve4: vi.fn(result(records.a ?? dnsError('ENODATA'))),
    resolve6: vi.fn(result(records.aaaa ?? dnsError('ENODATA'))),
  };
  return instance;
}

describe('EmailDomainChecker', () => {
  it('accepts a domain with MX records, then A or AAAA', async () => {
    expect(
      await checker({ mx: [{ exchange: 'mx.school.test' }] }).canReceiveMail(
        'a@school.test',
      ),
    ).toBe(true);
    expect(
      await checker({ a: ['192.0.2.1'] }).canReceiveMail('a@school.test'),
    ).toBe(true);
    expect(
      await checker({ aaaa: ['2001:db8::1'] }).canReceiveMail('a@school.test'),
    ).toBe(true);
  });

  it('refuses only when the domain definitely has no records', async () => {
    expect(await checker({}).canReceiveMail('a@school.test')).toBe(false);
    expect(
      await checker({ mx: dnsError('ENOTFOUND') }).canReceiveMail(
        'a@gmial.com',
      ),
    ).toBe(false);
  });

  it('accepts and logs when the resolver fails', async () => {
    const instance = checker({ mx: dnsError('ESERVFAIL') });
    expect(await instance.canReceiveMail('a@school.test')).toBe(true);
    expect(
      await checker({ mx: dnsError('ECONNREFUSED') }).canReceiveMail(
        'a@school.test',
      ),
    ).toBe(true);
  });

  it(`accepts when DNS does not answer within ${EMAIL_DOMAIN_TIMEOUT_MS} ms`, async () => {
    vi.useFakeTimers();
    try {
      const pending = checker({ mx: 'hang' }).canReceiveMail('a@school.test');
      await vi.advanceTimersByTimeAsync(EMAIL_DOMAIN_TIMEOUT_MS);
      expect(await pending).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('looks up nothing when CHECK_EMAIL_DOMAINS=false', async () => {
    const instance = checker({}, 'false');
    expect(await instance.canReceiveMail('a@gmial.com')).toBe(true);
    expect(instance.resolver.resolveMx).not.toHaveBeenCalled();
  });

  it('checks the part after the last @, lower-cased', async () => {
    const instance = checker({ mx: [{}] });
    await instance.canReceiveMail('"odd@name"@School.TEST');
    expect(instance.resolver.resolveMx).toHaveBeenCalledWith('school.test');
  });
});
