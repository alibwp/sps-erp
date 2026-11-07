import { Inject, Injectable } from '@nestjs/common';
import { STORAGE_DRIVER } from './storage-driver.js';
import type {
  PutOptions,
  SignedUrlOptions,
  StorageDriver,
} from './storage-driver.js';

// What the rest of the app injects to store files. The driver behind it is
// chosen by STORAGE_DRIVER (local or s3).
@Injectable()
export class StorageService {
  constructor(@Inject(STORAGE_DRIVER) readonly driver: StorageDriver) {}

  put(key: string, body: Buffer, options?: PutOptions): Promise<void> {
    return this.driver.put(key, body, options);
  }

  get(key: string): Promise<Buffer> {
    return this.driver.get(key);
  }

  delete(key: string): Promise<void> {
    return this.driver.delete(key);
  }

  exists(key: string): Promise<boolean> {
    return this.driver.exists(key);
  }

  signedUrl(key: string, options: SignedUrlOptions): Promise<string> {
    return this.driver.signedUrl(key, options);
  }

  isWritable(): Promise<boolean> {
    return this.driver.isWritable();
  }
}
