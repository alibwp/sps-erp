import { ConfigService } from '@nestjs/config';
import { databaseOptions } from './database.module.js';

const optionsFor = (env: Record<string, string>) =>
  databaseOptions(new ConfigService(env));

describe('databaseOptions', () => {
  it('synchronizes the local Docker database when asked to', () => {
    const options = optionsFor({
      DATABASE_URL: 'postgresql://sps:sps_password@db:5432/sps_erp',
      DB_SYNCHRONIZE: 'true',
    });

    expect(options).toMatchObject({ synchronize: true, ssl: false });
  });

  it('never synchronizes a remote database, even when asked to', () => {
    const options = optionsFor({
      DATABASE_URL: 'postgresql://user:pass@prod.example.com:5432/erp',
      DB_SYNCHRONIZE: 'true',
    });

    expect(options).toMatchObject({ synchronize: false });
  });

  it('verifies SSL certificates unless explicitly turned off', () => {
    const url = 'postgresql://user:pass@prod.example.com:5432/erp';

    expect(optionsFor({ DATABASE_URL: url, DB_SSL: 'true' })).toMatchObject({
      ssl: { rejectUnauthorized: true },
    });
    expect(
      optionsFor({
        DATABASE_URL: url,
        DB_SSL: 'true',
        DB_SSL_REJECT_UNAUTHORIZED: 'false',
      }),
    ).toMatchObject({ ssl: { rejectUnauthorized: false } });
  });
});
