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
