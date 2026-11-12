import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { S3Driver, contentDisposition } from './s3.driver.js';
import { StorageKeyError } from './storage-driver.js';

// Offline: the client never reaches AWS. Static fake credentials let the
// presigner sign locally.
function driverWith(send: (command: unknown) => unknown) {
  const client = new S3Client({
    region: 'eu-west-2',
    credentials: { accessKeyId: 'AKIDTEST', secretAccessKey: 'test-secret' },
  });
  vi.spyOn(client, 'send').mockImplementation(
    async (command: unknown) => send(command) as never,
  );
  return { driver: new S3Driver({ bucket: 'sps-files', client }), client };
}

describe('S3Driver', () => {
  it('puts an object with its content type and server-side encryption', async () => {
    const sent: unknown[] = [];
    const { driver } = driverWith((command) => sent.push(command));

    await driver.put('schools/1/a.pdf', Buffer.from('pdf'), {
      contentType: 'application/pdf',
    });

    const [command] = sent as PutObjectCommand[];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: 'sps-files',
      Key: 'schools/1/a.pdf',
      ContentType: 'application/pdf',
      ServerSideEncryption: 'AES256',
    });
  });

  it('reads the whole body', async () => {
    const { driver } = driverWith((command) => {
      expect(command).toBeInstanceOf(GetObjectCommand);
      return {
        Body: {
          transformToByteArray: async () => new TextEncoder().encode('hello'),
        },
      };
    });
    expect((await driver.get('a.txt')).toString()).toBe('hello');
  });

  it('deletes', async () => {
    const sent: unknown[] = [];
    const { driver } = driverWith((command) => sent.push(command));
    await driver.delete('a.txt');
    expect(sent[0]).toBeInstanceOf(DeleteObjectCommand);
  });

  it('exists() is false on NotFound and rethrows other errors', async () => {
    const notFound = driverWith(() => {
      throw Object.assign(new Error('no'), { name: 'NotFound' });
    });
    await expect(notFound.driver.exists('a.txt')).resolves.toBe(false);

    const denied = driverWith(() => {
      throw Object.assign(new Error('denied'), { name: 'AccessDenied' });
    });
    await expect(denied.driver.exists('a.txt')).rejects.toThrow('denied');

    const found = driverWith((command) => {
      expect(command).toBeInstanceOf(HeadObjectCommand);
      return {};
    });
    await expect(found.driver.exists('a.txt')).resolves.toBe(true);
  });

  it('signs a short-lived GET link with the download name', async () => {
    const { driver } = driverWith(() => ({}));
    const url = new URL(
      await driver.signedUrl('schools/1/a.pdf', {
        expiresInSeconds: 300,
        downloadName: 'Report.pdf',
      }),
    );

    expect(url.hostname).toBe('sps-files.s3.eu-west-2.amazonaws.com');
    expect(url.pathname).toBe('/schools/1/a.pdf');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(url.searchParams.get('response-content-disposition')).toBe(
      contentDisposition('Report.pdf'),
    );
  });

  it('checks the bucket for the health check', async () => {
    const { driver } = driverWith((command) => {
      expect(command).toBeInstanceOf(HeadBucketCommand);
      return {};
    });
    await expect(driver.isWritable()).resolves.toBe(true);
  });

  it('refuses invalid keys before calling S3', async () => {
    const send = vi.fn();
    const { driver } = driverWith(send);
    await expect(driver.put('../x', Buffer.from(''))).rejects.toThrow(
      StorageKeyError,
    );
    expect(send).not.toHaveBeenCalled();
  });
});

describe('contentDisposition', () => {
  it('quotes a safe ASCII fallback and the UTF-8 name', () => {
    expect(contentDisposition('Résumé "final".pdf')).toBe(
      `attachment; filename="R_sum_ _final_.pdf"; filename*=UTF-8''R%C3%A9sum%C3%A9%20%22final%22.pdf`,
    );
  });
});
