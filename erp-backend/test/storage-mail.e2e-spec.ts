import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { MailService } from '../src/mail/mail.service.js';
import { QUEUES } from '../src/queue/queue.module.js';
import { MAIL_TRANSPORT } from '../src/mail/mail.transport.js';
import { StorageService } from '../src/storage/storage.service.js';
import { createTestApp, waitFor } from './support/test-app.js';

describe('Storage and mail (e2e)', () => {
  let app: INestApplication;
  const sendMail = vi.fn().mockResolvedValue({});

  beforeAll(async () => {
    app = await createTestApp({
      overrides: [{ provide: MAIL_TRANSPORT, useValue: { sendMail } }],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('local storage signed links', () => {
    const pathOf = (url: string) => {
      const parsed = new URL(url);
      return `${parsed.pathname}${parsed.search}`;
    };

    it('download the file as an attachment', async () => {
      const storage = app.get(StorageService);
      await storage.put('e2e/report.csv', Buffer.from('name,total\nA,1\n'));
      const url = await storage.signedUrl('e2e/report.csv', {
        expiresInSeconds: 60,
        downloadName: 'Report.csv',
      });

      const res = await request(app.getHttpServer())
        .get(pathOf(url))
        .buffer(true)
        .parse((response, done) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => done(null, Buffer.concat(chunks)));
        })
        .expect(200);

      expect(res.headers['content-type']).toContain('application/octet-stream');
      expect(res.headers['content-disposition']).toContain(
        'attachment; filename="Report.csv"',
      );
      expect(res.headers['cache-control']).toBe('private, no-store');
      expect(Buffer.from(res.body).toString()).toBe('name,total\nA,1\n');
    });

    it('answer 404 in the error shape when altered or for a missing file', async () => {
      const storage = app.get(StorageService);
      await storage.put('e2e/a.txt', Buffer.from('a'));
      const url = new URL(
        await storage.signedUrl('e2e/a.txt', { expiresInSeconds: 60 }),
      );
      url.searchParams.set('key', 'e2e/other.txt');

      const altered = await request(app.getHttpServer())
        .get(`${url.pathname}${url.search}`)
        .expect(404);
      expect(altered.body.error).toEqual({
        code: 'not_found',
        message: 'This download link is invalid or has expired.',
      });

      const missing = await storage.signedUrl('e2e/never-stored.txt', {
        expiresInSeconds: 60,
      });
      await request(app.getHttpServer()).get(pathOf(missing)).expect(404);
      await request(app.getHttpServer())
        .get('/api/v1/storage/files')
        .expect(404);
    });
  });

  describe('mail', () => {
    it('is queued, then sent by the mail worker', async () => {
      const jobId = await app.get(MailService).send({
        to: 'guardian@school.test',
        subject: 'Invitation',
        text: 'Accept your invitation',
      });
      expect(jobId).toBeTruthy();

      await waitFor(async () => sendMail.mock.calls.length > 0);
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'guardian@school.test',
          subject: 'Invitation',
        }),
      );

      // The message (and any link in it) leaves Redis once sent.
      const queue = app.get<Queue>(getQueueToken(QUEUES.mail));
      await waitFor(async () => (await queue.getJob(jobId!)) === undefined);
      expect(await queue.getJobCounts('completed')).toEqual({ completed: 0 });
    });

    it('keeps a failed mail job for inspection', async () => {
      sendMail.mockRejectedValueOnce(new Error('SMTP refused'));
      const queue = app.get<Queue>(getQueueToken(QUEUES.mail));

      const jobId = await app.get(MailService).send({
        to: 'guardian@school.test',
        subject: 'Will fail once',
        text: 'Body',
      });

      // The first attempt fails; the job stays (retry pending).
      await waitFor(
        async () => (await queue.getJob(jobId!))?.attemptsMade === 1,
      );
      const job = await queue.getJob(jobId!);
      expect(job?.failedReason).toBe('SMTP refused');
      await job?.remove();
    });
  });
});
