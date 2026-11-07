import { ConfigService } from '@nestjs/config';
import {
  AppCrypto,
  parseAppKey,
  randomToken,
  safeEqual,
  sha256,
} from './app-crypto.service.js';

const key = (fill: number) =>
  `base64:${Buffer.alloc(32, fill).toString('base64')}`;
const cryptoWith = (appKey: string) =>
  new AppCrypto(new ConfigService({ APP_KEY: appKey }));

describe('parseAppKey', () => {
  it('accepts 32 bytes of base64, with or without the base64: prefix', () => {
    expect(parseAppKey(key(1))).toHaveLength(32);
    expect(parseAppKey(Buffer.alloc(32, 1).toString('base64'))).toHaveLength(
      32,
    );
  });

  it.each([
    undefined,
    '',
    'base64:',
    'not base64!',
    Buffer.alloc(31).toString('base64'),
    Buffer.alloc(33).toString('base64'),
  ])('refuses %j', (value) => {
    expect(parseAppKey(value)).toBeNull();
  });
});

describe('AppCrypto', () => {
  it('refuses to start without a valid APP_KEY', () => {
    expect(() => cryptoWith('short')).toThrow('APP_KEY must be 32 bytes');
  });

  it('encrypts so only the same key decrypts, with a fresh IV each time', () => {
    const crypto = cryptoWith(key(1));
    const a = crypto.encrypt('JBSWY3DPEHPK3PXP');
    const b = crypto.encrypt('JBSWY3DPEHPK3PXP');

    expect(a).not.toBe(b);
    expect(a).not.toContain('JBSWY3DPEHPK3PXP');
    expect(crypto.decrypt(a)).toBe('JBSWY3DPEHPK3PXP');
    expect(() => cryptoWith(key(2)).decrypt(a)).toThrow();
  });

  it('refuses a modified ciphertext', () => {
    const crypto = cryptoWith(key(1));
    const [v, iv, tag, data] = crypto.encrypt('secret').split('.');
    const flipped = Buffer.from(data, 'base64url');
    flipped[0] ^= 1;
    expect(() =>
      crypto.decrypt([v, iv, tag, flipped.toString('base64url')].join('.')),
    ).toThrow();
    expect(() => crypto.decrypt('v2.a.b.c')).toThrow(
      'Unknown encrypted value format',
    );
  });

  it('signs payloads; a changed payload, signature or key fails', () => {
    const crypto = cryptoWith(key(1));
    const token = crypto.sign({ u: 'user-1', x: 123 });

    expect(crypto.verify(token)).toEqual({ u: 'user-1', x: 123 });
    const [body, signature] = token.split('.');
    const changed = Buffer.from(
      JSON.stringify({ u: 'user-2', x: 123 }),
    ).toString('base64url');
    expect(crypto.verify(`${changed}.${signature}`)).toBeNull();
    expect(crypto.verify(`${body}.${signature}x`)).toBeNull();
    expect(crypto.verify(`${token}.extra`)).toBeNull();
    expect(cryptoWith(key(2)).verify(token)).toBeNull();
  });

  it('keeps encryption and signing keys apart', () => {
    const crypto = cryptoWith(key(1));
    expect(crypto.verify(crypto.encrypt('{}'))).toBeNull();
  });
});

describe('helpers', () => {
  it('sha256, randomToken and safeEqual', () => {
    expect(sha256('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(randomToken(48)).toMatch(/^[A-Za-z0-9_-]{64}$/);
    expect(randomToken()).not.toBe(randomToken());
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});
