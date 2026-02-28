import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import { UserService } from '../users/user.service';

export interface JwtPayload {
  sub: string;
  preferred_username?: string;
  given_name?: string;
  family_name?: string;
  email?: string;
  realm_access?: { roles?: string[] };
  resource_access?: Record<string, { roles?: string[] }>;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly userService: UserService) {
    const jwksUri = process.env.KEYCLOAK_JWKS_URI ?? 'http://localhost:8080/realms/nkwapa/protocol/openid-connect/certs';
    const issuer = process.env.KEYCLOAK_ISSUER ?? 'http://localhost:8080/realms/nkwapa';
    // Audience optional: Keycloak may omit `aud` or use different values. Set KEYCLOAK_AUDIENCE to enforce.
    const audience = process.env.KEYCLOAK_AUDIENCE?.trim();

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKeyProvider: passportJwtSecret({
        jwksUri,
        cache: true,
        cacheMaxAge: 600000,
      }),
      issuer,
      ...(audience ? { audience } : {}),
      algorithms: ['RS256'],
    });
  }

  async validate(payload: JwtPayload) {
    return this.userService.findOrCreateByKeycloakSub(
      payload.sub,
      payload.preferred_username ?? undefined,
      payload.email ?? undefined,
      payload.given_name ?? undefined,
      payload.family_name ?? undefined
    );
  }
}
