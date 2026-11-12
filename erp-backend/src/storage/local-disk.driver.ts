import { createHmac, timingSafeEqual } from 'node:crypto';
import { constants } from 'node:fs';
import { access, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import {
  SignedUrlOptions,
  StorageDriver,
  StorageKeyError,
  assertValidKey,
} from './storage-driver.js';

export interface LocalDiskOptions {
  root: string;
  // Public base URL of this backend, for example http://localhost:5000.
  appUrl: string;
  // Secret for signing download links. Signed links fail without it.
  signingSecret?: string;
}

export const LOCAL_DOWNLOAD_PATH = '/api/v1/storage/files';

export interface VerifiedDownload {
  key: string;
  downloadName?: string;
}

// Files on the local disk (a Docker volume in development).
export class LocalDiskDriver implements StorageDriver {
  readonly name = 'local';
  private readonly root: string;

  constructor(private readonly options: LocalDiskOptions) {
    this.root = resolve(options.root);
  }

  async put(key: string, body: Buffer): Promise<void> {
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.path(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      return (await stat(this.path(key))).isFile();
    } catch {
      return false;
    }
  }

  async signedUrl(key: string, options: SignedUrlOptions): Promise<string> {
    assertValidKey(key);
    const expires = Math.floor(Date.now() / 1000) + options.expiresInSeconds;
    const params = new URLSearchParams({ key, expires: String(expires) });
    if (options.downloadName) params.set('name', options.downloadName);
    params.set('signature', this.sign(params));
    return `${this.options.appUrl.replace(/\/$/, '')}${LOCAL_DOWNLOAD_PATH}?${params}`;
  }

  // Checks a link made by signedUrl(). Returns null when the signature is
  // wrong, the link has expired or the key is invalid.
  verify(
    query: Record<string, unknown>,
    nowSeconds = Date.now() / 1000,
  ): VerifiedDownload | null {
    const { key, expires, name, signature } = query;
    if (
      typeof key !== 'string' ||
      typeof expires !== 'string' ||
      typeof signature !== 'string'
    ) {
      return null;
    }
    if (name !== undefined && typeof name !== 'string') return null;
    if (!/^\d+$/.test(expires) || Number(expires) < nowSeconds) return null;
    // Exactly one SHA-256 in lower-case hex. Buffer.from(..., 'hex') would
    // silently drop a trailing odd character, so check the text first.
    if (!/^[0-9a-f]{64}$/.test(signature)) return null;

    const params = new URLSearchParams({ key, expires });
    if (name) params.set('name', name);
    const expected = Buffer.from(this.sign(params), 'hex');
    const given = Buffer.from(signature, 'hex');
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      return null;
    }
    try {
      assertValidKey(key);
    } catch {
      return null;
    }
    return { key, downloadName: name };
  }

  async isWritable(): Promise<boolean> {
    await mkdir(this.root, { recursive: true });
    await access(this.root, constants.W_OK);
    return true;
  }

  private sign(params: URLSearchParams): string {
    if (!this.options.signingSecret) {
      throw new Error('STORAGE_SIGNING_SECRET is not set');
    }
    return createHmac('sha256', this.options.signingSecret)
      .update(params.toString())
      .digest('hex');
  }

  private path(key: string): string {
    assertValidKey(key);
    const path = resolve(this.root, key);
    // Defence in depth: assertValidKey already refuses "..".
    if (!path.startsWith(this.root + sep)) {
      throw new StorageKeyError(`Invalid storage key: ${key}`);
    }
    return path;
  }
}
