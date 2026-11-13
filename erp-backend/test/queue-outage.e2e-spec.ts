import { createServer, connect, type Server, type Socket } from 'node:net';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { DataSource } from 'typeorm';
import { TransactionService } from '../src/common/database/transaction.service.js';
import { MailService } from '../src/mail/mail.service.js';
import { QueueUnavailable } from '../src/queue/add-job.js';
import { producerConnection } from '../src/queue/queue-connections.js';
import { redisOptions } from '../src/redis/redis.module.js';
import { testDataSource } from './support/test-database.js';
import { waitFor } from './support/test-app.js';

const message = { to: 'parent@school.test', subject: 'Reset', text: 'Link' };
// No demo accounts: MailService queues every message.
const users = { query: () => Promise.resolve([]) } as unknown as DataSource;

// A TCP proxy in front of the test Redis, so a test can take Redis away
// from one connection and bring it back.
class RedisProxy {
  private server?: Server;
  private sockets = new Set<Socket>();
  port = 0;

  constructor(private readonly target: { host: string; port: number }) {}

  async up(): Promise<void> {
    this.server = createServer((client) => {
      const upstream = connect(this.target.port, this.target.host);
      for (const socket of [client, upstream]) {
        this.sockets.add(socket);
        socket.on('error', () => socket.destroy());
        socket.on('close', () => this.sockets.delete(socket));
      }
      client.on('close', () => upstream.destroy());
      upstream.on('close', () => client.destroy());
      client.pipe(upstream).pipe(client);
    });
    await new Promise<void>((resolve) =>
      this.server!.listen(this.port, '127.0.0.1', resolve),
    );
    this.port = (this.server.address() as { port: number }).port;
  }

  async down(): Promise<void> {
    for (const socket of this.sockets) socket.destroy();
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
  }
}

function quietQueue(name: string, connection: object): Queue {
  const queue = new Queue(name, { connection });
  queue.on('error', () => undefined);
  return queue;
}

async function timed<T>(
  work: Promise<T>,
): Promise<{ error: unknown; ms: number }> {
  const start = Date.now();
  const error = await work.then(
    () => undefined,
    (e: unknown) => e,
  );
  return { error, ms: Date.now() - start };
}

describe('Queueing while Redis is down (e2e)', () => {
  const redis = redisOptions(new ConfigService());

  it('MailService.send rejects within 2 seconds when Redis cannot be reached at all', async () => {
    const queue = quietQueue(
      'e2e-unreachable',
      producerConnection({
        host: '127.0.0.1',
        port: 1,
        retryStrategy: () => 1000,
      }),
    );

    const { error, ms } = await timed(
      new MailService(queue, users).send(message),
    );

    expect(error).toBeInstanceOf(QueueUnavailable);
    expect(ms).toBeLessThan(2000);
    await queue.close();
  });

  it('a send refused before the queue ever connected is not added once Redis is reachable', async () => {
    // Reserve a port, then take the proxy down: the queue starts with
    // nothing to connect to, as when the backend starts before Redis.
    const proxy = new RedisProxy({ host: redis.host!, port: redis.port! });
    await proxy.up();
    await proxy.down();
    const queue = quietQueue(
      'e2e-never-connected',
      producerConnection({
        ...redis,
        host: '127.0.0.1',
        port: proxy.port,
        retryStrategy: () => 200,
      }),
    );

    const { error, ms } = await timed(
      new MailService(queue, users).send(message),
    );
    expect(error).toBeInstanceOf(QueueUnavailable);
    expect(ms).toBeLessThan(2000);

    // Redis becomes reachable and the queue connects.
    await proxy.up();
    await queue.waitUntilReady();
    // Give an abandoned add the time it would need to land.
    await new Promise((resolve) => setTimeout(resolve, 500));
    const counts = await queue.getJobCounts();
    expect(Object.values(counts).reduce((sum, n) => sum + n, 0)).toBe(0);

    await queue.obliterate({ force: true });
    await queue.close();
    await proxy.down();
  });

  it('rejects at once after Redis goes away, and the refused job is never added later', async () => {
    const proxy = new RedisProxy({ host: redis.host!, port: redis.port! });
    await proxy.up();
    const queue = quietQueue(
      'e2e-outage',
      producerConnection({
        ...redis,
        host: '127.0.0.1',
        port: proxy.port,
        retryStrategy: () => 200,
      }),
    );
    const mail = new MailService(queue, users);
    const client = await queue.client;

    expect(await mail.send(message)).toBeTruthy();

    await proxy.down();
    await waitFor(async () => client.status !== 'ready');
    const { error, ms } = await timed(mail.send(message));
    expect(error).toBeInstanceOf(QueueUnavailable);
    expect(ms).toBeLessThan(2000);

    // Redis comes back: only the job added before the outage exists.
    await proxy.up();
    await waitFor(async () => client.status === 'ready');
    expect((await queue.getJobCounts('waiting')).waiting).toBe(1);

    await queue.obliterate({ force: true });
    await queue.close();
    await proxy.down();
  });

  describe('an email queued after commit', () => {
    let dataSource: DataSource;

    beforeAll(async () => {
      dataSource = await testDataSource().initialize();
      await dataSource.query('CREATE TABLE e2e_outage_records (note text)');
    });

    afterAll(async () => {
      await dataSource.query('DROP TABLE e2e_outage_records');
      await dataSource.destroy();
    });

    it('is logged as failed while the committed data stays', async () => {
      const queue = quietQueue(
        'e2e-unreachable',
        producerConnection({
          host: '127.0.0.1',
          port: 1,
          retryStrategy: () => 1000,
        }),
      );
      const mail = new MailService(queue, users);
      const logged = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      const { error, ms } = await timed(
        new TransactionService(dataSource).run(async (tx) => {
          await tx.manager.query(
            "INSERT INTO e2e_outage_records VALUES ('invited')",
          );
          tx.afterCommit(() => mail.send(message));
        }),
      );

      expect(error).toBeUndefined();
      expect(ms).toBeLessThan(2500);
      expect(
        await dataSource.query('SELECT note FROM e2e_outage_records'),
      ).toEqual([{ note: 'invited' }]);
      expect(logged).toHaveBeenCalledWith(
        expect.stringContaining('After-commit step failed'),
      );

      logged.mockRestore();
      await queue.close();
    });
  });
});
