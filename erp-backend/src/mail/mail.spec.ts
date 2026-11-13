import { ConfigService } from '@nestjs/config';
import { MailProcessor } from './mail.processor.js';
import { MailService, SEND_MAIL_JOB } from './mail.service.js';
import { createMailTransport } from './mail.transport.js';

const message = { to: 'parent@example.com', subject: 'Welcome', text: 'Hello' };

// The users table as MailService reads it: the demo addresses among those
// asked about.
function users(demo: string[] = []) {
  return {
    query: vi.fn((_sql: string, [asked]: [string[]]) =>
      Promise.resolve(
        asked
          .filter((email) => demo.includes(email))
          .map((email) => ({ email })),
      ),
    ),
  };
}

describe('MailService', () => {
  it('only enqueues the message, with retries, and drops it once sent', async () => {
    const queue = {
      name: 'mail',
      waitUntilReady: vi.fn().mockResolvedValue({}),
      add: vi.fn().mockResolvedValue({ id: 'job-1' }),
    };

    await expect(
      new MailService(queue as never, users() as never).send(message),
    ).resolves.toBe('job-1');

    expect(queue.add).toHaveBeenCalledWith(SEND_MAIL_JOB, message, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: true,
    });
  });

  it('never emails a demo account', async () => {
    const queue = {
      name: 'mail',
      waitUntilReady: vi.fn().mockResolvedValue({}),
      add: vi.fn().mockResolvedValue({ id: 'job-2' }),
    };
    const service = new MailService(
      queue as never,
      users(['teacher@gmail.com']) as never,
    );

    await expect(
      service.send({ ...message, to: ' Teacher@Gmail.com ' }),
    ).resolves.toBeUndefined();
    await expect(
      service.send({
        ...message,
        to: ['teacher@gmail.com', 'head@school.test'],
      }),
    ).resolves.toBe('job-2');

    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledWith(
      SEND_MAIL_JOB,
      { ...message, to: ['head@school.test'] },
      expect.anything(),
    );
  });

  it('fails with 503 service_unavailable when the queue refuses the job', async () => {
    const queue = {
      name: 'mail',
      waitUntilReady: vi.fn().mockResolvedValue({}),
      add: vi.fn().mockRejectedValue(new Error("Stream isn't writeable")),
    };

    await expect(
      new MailService(queue as never, users() as never).send(message),
    ).rejects.toMatchObject({
      code: 'service_unavailable',
      status: 503,
    });
  });
});

describe('MailProcessor', () => {
  it('sends through the transport from MAIL_FROM', async () => {
    const transport = { sendMail: vi.fn().mockResolvedValue({}) };
    const processor = new MailProcessor(
      transport as never,
      new ConfigService({ MAIL_FROM: 'SPS ERP <no-reply@school.test>' }),
    );

    await processor.process({
      id: '1',
      name: SEND_MAIL_JOB,
      data: message,
    } as never);

    expect(transport.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'SPS ERP <no-reply@school.test>',
        ...message,
      }),
    );
  });

  it('lets a send failure fail the job so BullMQ retries it', async () => {
    const transport = {
      sendMail: vi.fn().mockRejectedValue(new Error('SMTP down')),
    };
    const processor = new MailProcessor(
      transport as never,
      new ConfigService({}),
    );

    await expect(
      processor.process({
        id: '1',
        name: SEND_MAIL_JOB,
        data: message,
      } as never),
    ).rejects.toThrow('SMTP down');
  });
});

describe('createMailTransport', () => {
  it('uses the SMTP settings and leaves auth off without a user', () => {
    const transport = createMailTransport(
      new ConfigService({ SMTP_HOST: 'mailpit', SMTP_PORT: '1025' }),
    );
    const options = (
      transport as unknown as { options: Record<string, unknown> }
    ).options;
    expect(options).toMatchObject({
      host: 'mailpit',
      port: 1025,
      secure: false,
    });
    expect(options.auth).toBeUndefined();
  });
});
