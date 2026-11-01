import { ConfigService } from '@nestjs/config';
import { corsOrigins } from './setup-app.js';

describe('corsOrigins', () => {
  it('allows the local frontend on localhost and 127.0.0.1 by default', () => {
    expect(corsOrigins(new ConfigService({}))).toEqual([
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ]);
  });

  it('reads a comma-separated CORS_ORIGIN', () => {
    const config = new ConfigService({
      CORS_ORIGIN: 'https://erp.example.com, https://admin.example.com',
    });

    expect(corsOrigins(config)).toEqual([
      'https://erp.example.com',
      'https://admin.example.com',
    ]);
  });
});
