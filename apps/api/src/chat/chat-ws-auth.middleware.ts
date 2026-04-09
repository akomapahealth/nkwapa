import { Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import { JwksClient } from 'jwks-rsa';
import { UserRole } from '@prisma/client';

export interface WsAuthData {
  userId: string;
  clinicId: string;
  displayName: string;
  roles: { clinicId: string | null; role: UserRole }[];
}

const jwksUri =
  process.env.KEYCLOAK_JWKS_URI ??
  'http://localhost:8080/realms/nkwapa/protocol/openid-connect/certs';

const issuer = process.env.KEYCLOAK_ISSUER ?? 'http://localhost:8080/realms/nkwapa';

const jwksClient = new JwksClient({
  jwksUri,
  cache: true,
  cacheMaxAge: 600_000, // 10 minutes
});

function getKey(header: jwt.JwtHeader, callback: (err: Error | null, key?: string) => void) {
  jwksClient.getSigningKey(
    header.kid,
    (err: Error | null, key?: { getPublicKey: () => string }) => {
      if (err) {
        callback(err);
        return;
      }
      callback(null, key?.getPublicKey());
    },
  );
}

/**
 * Verify a JWT token against the Keycloak JWKS endpoint.
 * Returns the decoded payload on success.
 */
export function verifyJwt(token: string): Promise<jwt.JwtPayload> {
  return new Promise((resolve, reject) => {
    jwt.verify(token, getKey, { algorithms: ['RS256'], issuer }, (err, decoded) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(decoded as jwt.JwtPayload);
    });
  });
}

/**
 * Socket.IO middleware that validates the JWT from the handshake auth object,
 * looks up the user in the database, and attaches auth data to socket.data.
 */
export function createWsAuthMiddleware(prisma: {
  user: {
    findUnique: (args: {
      where: { keycloakSub: string };
      include: { clinicRoles: boolean };
    }) => Promise<{
      id: string;
      displayName: string;
      isActive: boolean;
      clinicRoles: { clinicId: string | null; role: UserRole }[];
    } | null>;
  };
}) {
  return async (socket: Socket, next: (err?: Error) => void) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) {
        next(new Error('Authentication required'));
        return;
      }

      const clinicId = socket.handshake.query?.clinicId as string;
      if (!clinicId) {
        next(new Error('Clinic ID required'));
        return;
      }

      // Verify JWT
      const payload = await verifyJwt(token);

      if (!payload.sub) {
        next(new Error('Invalid token: missing sub'));
        return;
      }

      // Look up user
      const user = await prisma.user.findUnique({
        where: { keycloakSub: payload.sub },
        include: { clinicRoles: true },
      });

      if (!user || !user.isActive) {
        next(new Error('User not found or disabled'));
        return;
      }

      // Check clinic access
      const isSystemAdmin = user.clinicRoles.some((r) => r.role === UserRole.SYSTEM_ADMIN);
      const hasClinicAccess = user.clinicRoles.some((r) => r.clinicId === clinicId);

      if (!isSystemAdmin && !hasClinicAccess) {
        next(new Error('Access denied to clinic'));
        return;
      }

      // Attach auth data to socket
      const authData: WsAuthData = {
        userId: user.id,
        clinicId,
        displayName: user.displayName,
        roles: user.clinicRoles.map((r) => ({
          clinicId: r.clinicId,
          role: r.role,
        })),
      };

      socket.data.auth = authData;
      next();
    } catch {
      next(new Error('Authentication failed'));
    }
  };
}
