import { Public } from '../identity/auth/auth-context.js';
import {
  Controller,
  Get,
  HttpStatus,
  NotFoundException,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiErrorResponses } from '../common/openapi/openapi.js';
import { LocalDiskDriver } from './local-disk.driver.js';
import { contentDisposition } from './s3.driver.js';
import { StorageService } from './storage.service.js';

// Serves signed download links when files are on the local disk. With the
// S3 driver the links point at S3 itself and this route answers 404.
@ApiTags('Storage')
@Public()
@Controller('storage')
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Get('files')
  @ApiOperation({
    summary: 'Download a file through a signed link',
    description:
      'Links come from other endpoints and expire after a few minutes. Local disk storage only.',
  })
  @ApiQuery({ name: 'key', required: true })
  @ApiQuery({
    name: 'expires',
    required: true,
    description: 'Unix time in seconds',
  })
  @ApiQuery({
    name: 'name',
    required: false,
    description: 'Download file name',
  })
  @ApiQuery({ name: 'signature', required: true })
  @ApiOkResponse({
    description: 'The file',
    content: {
      'application/octet-stream': {
        schema: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiErrorResponses(HttpStatus.NOT_FOUND, HttpStatus.TOO_MANY_REQUESTS)
  async download(
    @Query() query: Record<string, unknown>,
    @Res() res: Response,
  ): Promise<void> {
    const driver = this.storage.driver;
    if (!(driver instanceof LocalDiskDriver)) throw new NotFoundException();

    // Expired, altered and unknown links all answer the same 404.
    const download = driver.verify(query);
    if (!download || !(await driver.exists(download.key))) {
      throw new NotFoundException(
        'This download link is invalid or has expired.',
      );
    }

    const body = await driver.get(download.key);
    const name =
      download.downloadName ?? download.key.split('/').pop() ?? 'download';
    res
      .status(200)
      .type('application/octet-stream')
      .setHeader('Content-Disposition', contentDisposition(name))
      .setHeader('Cache-Control', 'private, no-store')
      .send(body);
  }
}
