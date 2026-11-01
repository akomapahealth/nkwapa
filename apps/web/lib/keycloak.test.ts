jest.mock('keycloak-js', () => jest.fn());

import { canReachKeycloak } from './keycloak';

describe('canReachKeycloak (#206)', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('asks the configured realm, not an uninitialised client, with an opaque request', async () => {
    fetchMock.mockResolvedValue({ type: 'opaque' });
    await expect(canReachKeycloak()).resolves.toBe(true);
    const url = process.env.NEXT_PUBLIC_KEYCLOAK_URL ?? 'http://localhost:8080';
    const realm = process.env.NEXT_PUBLIC_KEYCLOAK_REALM ?? 'nkwapa';
    expect(fetchMock).toHaveBeenCalledWith(`${url}/realms/${realm}`, {
      mode: 'no-cors',
      cache: 'no-store',
    });
  });

  it('reports unreachable only when the network itself fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(canReachKeycloak()).resolves.toBe(false);
  });
});
