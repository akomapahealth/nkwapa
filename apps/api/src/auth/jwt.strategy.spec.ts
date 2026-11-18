import { generateKeyPairSync } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  it('passes verified Keycloak emails into local user sync', async () => {
    const userService = {
      findOrCreateByKeycloakSub: jest.fn().mockResolvedValue({ user: {}, roles: [] }),
    };
    const strategy = new JwtStrategy(userService as never);

    await strategy.validate({
      sub: 'kc-sub-1',
      preferred_username: 'ama',
      email: 'ama@example.com',
      email_verified: true,
      given_name: 'Ama',
      family_name: 'Mensah',
      phone_number: '+233240000000',
    });

    expect(userService.findOrCreateByKeycloakSub).toHaveBeenCalledWith(
      'kc-sub-1',
      'ama',
      'ama@example.com',
      'Ama',
      'Mensah',
      '+233240000000',
    );
  });

  it('does not pass unverified Keycloak emails into local user sync', async () => {
    const userService = {
      findOrCreateByKeycloakSub: jest.fn().mockResolvedValue({ user: {}, roles: [] }),
    };
    const strategy = new JwtStrategy(userService as never);

    await strategy.validate({
      sub: 'kc-sub-1',
      email: 'unverified@example.com',
      email_verified: false,
    });

    expect(userService.findOrCreateByKeycloakSub).toHaveBeenCalledWith(
      'kc-sub-1',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );
  });
});

describe('JwtStrategy audience', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const issuer = 'http://localhost:8080/realms/nkwapa';
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
    jest.resetModules();
  });

  // Runs the passport strategy end to end on a bearer token; resolves 'success' or 'fail'.
  function authenticate(aud: string): Promise<'success' | 'fail'> {
    process.env = { ...originalEnv, KEYCLOAK_ISSUER: issuer, KEYCLOAK_AUDIENCE: 'nkwapa-api' };
    jest.doMock('jwks-rsa', () => ({
      passportJwtSecret: () => (_req: unknown, _raw: unknown, done: (e: null, k: string) => void) =>
        done(null, publicKey.export({ type: 'spki', format: 'pem' }) as string),
    }));
    let Strategy!: typeof JwtStrategy;
    jest.isolateModules(() => {
      Strategy = require('./jwt.strategy').JwtStrategy;
    });
    const userService = { findOrCreateByKeycloakSub: jest.fn().mockResolvedValue({ user: {} }) };
    const strategy = new Strategy(userService as never) as unknown as {
      success: () => void;
      fail: () => void;
      error: (e: Error) => void;
      authenticate: (req: object) => void;
    };
    const token = jwt.sign({ sub: 'kc-sub-1' }, privateKey, {
      algorithm: 'RS256',
      issuer,
      audience: aud,
    });

    return new Promise((resolve, reject) => {
      strategy.success = () => resolve('success');
      strategy.fail = () => resolve('fail');
      strategy.error = reject;
      strategy.authenticate({ headers: { authorization: `Bearer ${token}` } });
    });
  }

  it('accepts a token for the configured audience', async () => {
    await expect(authenticate('nkwapa-api')).resolves.toBe('success');
  });

  it('rejects a token minted for another audience', async () => {
    await expect(authenticate('account')).resolves.toBe('fail');
  });
});
