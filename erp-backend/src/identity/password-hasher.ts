import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';

// argon2id with the library's defaults.
@Injectable()
export class PasswordHasher {
  private dummyHash?: Promise<string>;

  hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  // False for a wrong password, a missing hash or a damaged hash. A missing
  // hash still costs one verification, so an unknown email takes as long
  // as a known one.
  async verify(
    hash: string | null | undefined,
    password: string,
  ): Promise<boolean> {
    if (!hash) {
      this.dummyHash ??= this.hash('no account has this password');
      await argon2.verify(await this.dummyHash, password).catch(() => false);
      return false;
    }
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }
}
