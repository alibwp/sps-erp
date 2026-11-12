import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalDiskDriver } from './local-disk.driver.js';
import { StorageKeyError, assertValidKey } from './storage-driver.js';

describe('assertValidKey', () => {
  it.each(['a.pdf', 'schools/123/notices/report-1.pdf', 'x/y_z.v2.csv'])(
    'accepts %s',
    (key) => {
      expect(assertValidKey(key)).toBe(key);
    },
  );

  it.each([
    '',
    '/etc/passwd',
    '../secret',
    'a/../../b',
    'a//b',
    'a/.hidden',
    'a\\b',
    'a b',
    'c:/x',
  ])('refuses %j', (key) => {
    expect(() => assertValidKey(key)).toThrow(StorageKeyError);
  });
});

describe('LocalDiskDriver', () => {
  let root: string;
  let driver: LocalDiskDriver;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'sps-storage-'));
    driver = new LocalDiskDriver({
      root,
      appUrl: 'http://localhost:5000/',
      signingSecret: 'test-secret',
    });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('puts, reads, checks and deletes a file', async () => {
    await driver.put('schools/1/a.txt', Buffer.from('hello'));

    expect(await driver.exists('schools/1/a.txt')).toBe(true);
    expect((await driver.get('schools/1/a.txt')).toString()).toBe('hello');

    await driver.delete('schools/1/a.txt');
    expect(await driver.exists('schools/1/a.txt')).toBe(false);
    await expect(driver.delete('schools/1/a.txt')).resolves.toBeUndefined();
  });

  it('never writes outside its root', async () => {
    await expect(driver.put('../escape.txt', Buffer.from('x'))).rejects.toThrow(
      StorageKeyError,
    );
    await expect(driver.get('/etc/hosts')).rejects.toThrow(StorageKeyError);
  });

  it('reports a writable root', async () => {
    await expect(driver.isWritable()).resolves.toBe(true);
  });

  describe('signed links', () => {
    const parse = (url: string) => {
      const parsed = new URL(url);
      return { parsed, query: Object.fromEntries(parsed.searchParams) };
    };

    it('point at the download route and verify', async () => {
      const { parsed, query } = parse(
        await driver.signedUrl('schools/1/a.pdf', {
          expiresInSeconds: 300,
          downloadName: 'Report.pdf',
        }),
      );

      expect(`${parsed.origin}${parsed.pathname}`).toBe(
        'http://localhost:5000/api/v1/storage/files',
      );
      expect(driver.verify(query)).toEqual({
        key: 'schools/1/a.pdf',
        downloadName: 'Report.pdf',
      });
    });

    it('refuse a changed key, name or expiry', async () => {
      const { query } = parse(
        await driver.signedUrl('a.pdf', {
          expiresInSeconds: 300,
          downloadName: 'a.pdf',
        }),
      );

      expect(driver.verify({ ...query, key: 'b.pdf' })).toBeNull();
      expect(driver.verify({ ...query, name: 'evil.html' })).toBeNull();
      expect(
        driver.verify({
          ...query,
          expires: String(Number(query.expires) + 1000),
        }),
      ).toBeNull();
      expect(driver.verify({ ...query, signature: 'abcd' })).toBeNull();
      expect(driver.verify({ ...query, signature: 'not-hex' })).toBeNull();
      // Node ignores an odd trailing hex digit; the link must still fail.
      expect(
        driver.verify({ ...query, signature: `${query.signature}0` }),
      ).toBeNull();
      expect(
        driver.verify({ ...query, signature: query.signature.toUpperCase() }),
      ).toBeNull();
      expect(driver.verify({ key: 'a.pdf' })).toBeNull();
    });

    it('refuse an expired link', async () => {
      const { query } = parse(
        await driver.signedUrl('a.pdf', { expiresInSeconds: 60 }),
      );
      expect(driver.verify(query, Date.now() / 1000 + 61)).toBeNull();
    });

    it('refuse links signed with another secret', async () => {
      const other = new LocalDiskDriver({
        root,
        appUrl: 'http://x',
        signingSecret: 'other',
      });
      const { query } = parse(
        await other.signedUrl('a.pdf', { expiresInSeconds: 60 }),
      );
      expect(driver.verify(query)).toBeNull();
    });

    it('cannot be made without a signing secret', async () => {
      const unsigned = new LocalDiskDriver({ root, appUrl: 'http://x' });
      await expect(
        unsigned.signedUrl('a.pdf', { expiresInSeconds: 60 }),
      ).rejects.toThrow('STORAGE_SIGNING_SECRET');
    });
  });
});
