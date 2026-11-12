import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocalDiskDriver } from './local-disk.driver.js';
import { S3Driver } from './s3.driver.js';
import { STORAGE_DRIVER, StorageDriver } from './storage-driver.js';
import { StorageController } from './storage.controller.js';
import { StorageService } from './storage.service.js';

export function createStorageDriver(config: ConfigService): StorageDriver {
  if (config.get('STORAGE_DRIVER', 'local') === 's3') {
    return S3Driver.create(
      config.getOrThrow<string>('S3_BUCKET'),
      config.getOrThrow<string>('AWS_REGION'),
    );
  }
  return new LocalDiskDriver({
    root: config.get<string>('STORAGE_LOCAL_ROOT', 'storage'),
    appUrl: config.get<string>('APP_URL', 'http://localhost:5000'),
    signingSecret: config.get<string>('STORAGE_SIGNING_SECRET'),
  });
}

@Global()
@Module({
  controllers: [StorageController],
  providers: [
    {
      provide: STORAGE_DRIVER,
      inject: [ConfigService],
      useFactory: createStorageDriver,
    },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
