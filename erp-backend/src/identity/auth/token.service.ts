import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export const ACCESS_TOKEN_SECONDS = 15 * 60;
const ISSUER = 'sps-erp';
const AUDIENCE = 'sps-erp-api';

export interface AccessTokenClaims {
  sub: string; // user id
  sid: string; // session id
}

// Short-lived access tokens (JWT, HS256, JWT_SECRET).
@Injectable()
export class TokenService {
  constructor(private readonly jwt: JwtService) {}

  issue(claims: AccessTokenClaims): Promise<string> {
    return this.jwt.signAsync(
      { sub: claims.sub, sid: claims.sid },
      {
        expiresIn: ACCESS_TOKEN_SECONDS,
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithm: 'HS256',
      },
    );
  }

  // The claims of a valid, unexpired token; null otherwise.
  async verify(token: string): Promise<AccessTokenClaims | null> {
    try {
      const claims = await this.jwt.verifyAsync<Partial<AccessTokenClaims>>(
        token,
        {
          issuer: ISSUER,
          audience: AUDIENCE,
          algorithms: ['HS256'],
        },
      );
      return typeof claims.sub === 'string' && typeof claims.sid === 'string'
        ? { sub: claims.sub, sid: claims.sid }
        : null;
    } catch {
      return null;
    }
  }
}
