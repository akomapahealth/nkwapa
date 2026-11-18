import { assertProductionConfig } from './api-config';

describe('assertProductionConfig', () => {
  const complete = {
    NODE_ENV: 'production',
    KEYCLOAK_AUDIENCE: 'nkwapa-api',
    CLIENT_IP_HEADER: 'true-client-ip',
  };

  it('passes in production when both settings are present', () => {
    expect(() => assertProductionConfig(complete)).not.toThrow();
  });

  it.each(['KEYCLOAK_AUDIENCE', 'CLIENT_IP_HEADER'])(
    'refuses to start in production without %s, naming it',
    (name) => {
      expect(() => assertProductionConfig({ ...complete, [name]: undefined })).toThrow(name);
      expect(() => assertProductionConfig({ ...complete, [name]: '  ' })).toThrow(name);
    },
  );

  it('names both when both are missing', () => {
    expect(() => assertProductionConfig({ NODE_ENV: 'production' })).toThrow(
      'KEYCLOAK_AUDIENCE and CLIENT_IP_HEADER',
    );
  });

  it('leaves development and test alone', () => {
    expect(() => assertProductionConfig({ NODE_ENV: 'development' })).not.toThrow();
    expect(() => assertProductionConfig({ NODE_ENV: 'test' })).not.toThrow();
    expect(() => assertProductionConfig({})).not.toThrow();
  });
});
