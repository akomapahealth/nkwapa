import { isKeycloakCallback } from './keycloak-callback';

describe('isKeycloakCallback', () => {
  it('recognises the authorization response in the fragment, the default response mode', () => {
    expect(
      isKeycloakCallback({ hash: '#state=abc&session_state=s&iss=x&code=xyz', search: '' }),
    ).toBe(true);
  });

  it('recognises it in the query as well', () => {
    expect(isKeycloakCallback({ hash: '', search: '?next=%2Fdashboard&state=a&code=b' })).toBe(
      true,
    );
  });

  it('is not fooled by an ordinary page or half a response', () => {
    expect(isKeycloakCallback({ hash: '', search: '?next=%2Fdashboard' })).toBe(false);
    expect(isKeycloakCallback({ hash: '#code=only', search: '' })).toBe(false);
    expect(isKeycloakCallback({ hash: '#section-2', search: '?state=only' })).toBe(false);
  });
});
