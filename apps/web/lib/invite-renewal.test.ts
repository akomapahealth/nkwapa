import { resetPendingIdempotencyKeys } from './api';
import { requestInvitationRenewal } from './invite-renewal';

describe('requestInvitationRenewal (#307)', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    resetPendingIdempotencyKeys();
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  it('posts the request without a clinic and returns what the API said', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ status: 'RECEIVED', message: 'The clinic will see it.' }), {
        status: 202,
      }),
    );

    await expect(requestInvitationRenewal(async () => 'token')).resolves.toBe(
      'The clinic will see it.',
    );
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/me\/invitations\/renewal-request$/);
    expect(init.method).toBe('POST');
    expect((init.headers as Headers).get('X-Clinic-Id')).toBeNull();
  });

  it('surfaces a rate limit as an error', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: 'Too many requests' }), { status: 429 }),
    );
    await expect(requestInvitationRenewal(async () => 'token')).rejects.toMatchObject({
      status: 429,
    });
  });
});
