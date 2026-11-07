export interface PutOptions {
  contentType?: string;
}

export interface SignedUrlOptions {
  // How long the link works. Keep it short: minutes, not days.
  expiresInSeconds: number;
  // File name the browser saves the download as.
  downloadName?: string;
}

// Where uploaded and generated files live. Keys are relative paths such as
// "schools/<id>/notices/<id>/attachment.pdf"; they never come straight from
// a client.
export interface StorageDriver {
  readonly name: 'local' | 's3';
  put(key: string, body: Buffer, options?: PutOptions): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  signedUrl(key: string, options: SignedUrlOptions): Promise<string>;
  // True when files can be written (used by GET /api/health).
  isWritable(): Promise<boolean>;
}

export const STORAGE_DRIVER = Symbol('STORAGE_DRIVER');

export class StorageKeyError extends Error {}

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

// Refuses absolute paths, "..", empty segments and unusual characters, so a
// key can never point outside the storage root.
export function assertValidKey(key: string): string {
  if (!key || key.length > 1024) {
    throw new StorageKeyError(
      'A storage key must be 1 to 1024 characters long',
    );
  }
  for (const segment of key.split('/')) {
    if (!SEGMENT.test(segment) || segment === '..') {
      throw new StorageKeyError(`Invalid storage key: ${key}`);
    }
  }
  return key;
}
