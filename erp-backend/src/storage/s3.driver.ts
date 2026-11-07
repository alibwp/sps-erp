import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  PutOptions,
  SignedUrlOptions,
  StorageDriver,
  assertValidKey,
} from './storage-driver.js';

export interface S3DriverOptions {
  bucket: string;
  client: S3Client;
}

// Files in an S3 bucket in the project's selected AWS Region. Credentials
// come from the default provider chain (task role, instance profile, env).
export class S3Driver implements StorageDriver {
  readonly name = 's3';

  constructor(private readonly options: S3DriverOptions) {}

  static create(bucket: string, region: string): S3Driver {
    return new S3Driver({ bucket, client: new S3Client({ region }) });
  }

  async put(
    key: string,
    body: Buffer,
    options: PutOptions = {},
  ): Promise<void> {
    await this.options.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: assertValidKey(key),
        Body: body,
        ContentType: options.contentType,
        ServerSideEncryption: 'AES256',
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const output = await this.options.client.send(
      new GetObjectCommand({
        Bucket: this.options.bucket,
        Key: assertValidKey(key),
      }),
    );
    if (!output.Body) throw new Error(`Empty body for storage key ${key}`);
    return Buffer.from(await output.Body.transformToByteArray());
  }

  async delete(key: string): Promise<void> {
    await this.options.client.send(
      new DeleteObjectCommand({
        Bucket: this.options.bucket,
        Key: assertValidKey(key),
      }),
    );
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.options.client.send(
        new HeadObjectCommand({
          Bucket: this.options.bucket,
          Key: assertValidKey(key),
        }),
      );
      return true;
    } catch (error) {
      if ((error as { name?: string }).name === 'NotFound') return false;
      throw error;
    }
  }

  async signedUrl(key: string, options: SignedUrlOptions): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.options.bucket,
      Key: assertValidKey(key),
      ResponseContentDisposition: options.downloadName
        ? contentDisposition(options.downloadName)
        : undefined,
    });
    return getSignedUrl(this.options.client, command, {
      expiresIn: options.expiresInSeconds,
    });
  }

  async isWritable(): Promise<boolean> {
    await this.options.client.send(
      new HeadBucketCommand({ Bucket: this.options.bucket }),
    );
    return true;
  }
}

export function contentDisposition(fileName: string): string {
  const fallback = fileName.replace(/[^\x20-\x7e]|["\\]/g, '_');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
