import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// APP_KEY: 32 random bytes, base64, optionally prefixed "base64:".
export function parseAppKey(value: string | undefined): Buffer | null {
  if (!value) return null;
  const encoded = value.startsWith('base64:') ? value.slice(7) : value;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return null;
  const key = Buffer.from(encoded, 'base64');
  return key.length === 32 ? key : null;
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

// URL-safe random token with the given number of random bytes.
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

// Compares two strings without leaking where they differ.
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

// Encryption of stored secrets and signing of links, both from APP_KEY.
// Each use gets its own key derived with HKDF, so one never weakens the
// other.
@Injectable()
export class AppCrypto {
  private readonly encryptionKey: Buffer;
  private readonly signingKey: Buffer;

  constructor(config: ConfigService) {
    const appKey = parseAppKey(config.get<string>('APP_KEY'));
    if (!appKey) throw new Error('APP_KEY must be 32 bytes, base64-encoded');
    this.encryptionKey = Buffer.from(
      hkdfSync('sha256', appKey, '', 'sps-erp encryption', 32),
    );
    this.signingKey = Buffer.from(
      hkdfSync('sha256', appKey, '', 'sps-erp signing', 32),
    );
  }

  // AES-256-GCM: "v1.<iv>.<tag>.<ciphertext>", base64url parts.
  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    return ['v1', iv, cipher.getAuthTag(), ciphertext]
      .map((part) =>
        typeof part === 'string' ? part : part.toString('base64url'),
      )
      .join('.');
  }

  decrypt(payload: string): string {
    const [version, iv, tag, ciphertext] = payload.split('.');
    if (version !== 'v1' || !iv || !tag || ciphertext === undefined) {
      throw new Error('Unknown encrypted value format');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      Buffer.from(iv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  // "<payload>.<signature>": the payload is readable, not secret.
  sign(payload: object): string {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${this.signature(body)}`;
  }

  // The payload when the signature is valid, otherwise null.
  verify<T>(token: string): T | null {
    const [body, signature, extra] = token.split('.');
    if (!body || !signature || extra !== undefined) return null;
    if (!safeEqual(signature, this.signature(body))) return null;
    try {
      return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
    } catch {
      return null;
    }
  }

  private signature(body: string): string {
    return createHmac('sha256', this.signingKey)
      .update(body)
      .digest('base64url');
  }
}
