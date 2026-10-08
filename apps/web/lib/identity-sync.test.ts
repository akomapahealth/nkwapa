import { describeIdentitySync } from './identity-sync';

describe('describeIdentitySync', () => {
  // Every account in the system starts here. Saying anything about it would be noise.
  it('says nothing about an active user whose identity was never touched', () => {
    expect(describeIdentitySync(true, { status: 'NOT_SYNCED', failureReason: null })).toBeNull();
    expect(describeIdentitySync(true, null)).toBeNull();
  });

  it('confirms a deactivated user can no longer sign in', () => {
    expect(describeIdentitySync(false, { status: 'IN_SYNC', failureReason: null })).toMatchObject({
      label: 'Sign-in disabled',
      offerSync: false,
    });
  });

  // The state the issue exists for: blocked here, still able to sign in, and fixable.
  it('flags a deactivated user whose sign-in could not be disabled, and offers a sync', () => {
    const described = describeIdentitySync(false, {
      status: 'FAILED',
      failureReason: 'KEYCLOAK_ADMIN_TIMEOUT',
    });
    expect(described).toMatchObject({
      label: 'Can still sign in',
      variant: 'destructive',
      offerSync: true,
    });
    expect(described?.detail).toContain('did not respond');
    expect(described?.detail).not.toContain('KEYCLOAK_ADMIN_TIMEOUT');
  });

  it('flags a reactivated user who still cannot sign in', () => {
    expect(
      describeIdentitySync(true, { status: 'FAILED', failureReason: 'IDENTITY_NOT_FOUND' }),
    ).toMatchObject({ label: 'Cannot sign in', offerSync: true });
  });

  it('marks users deactivated before this existed as not yet disabled', () => {
    expect(
      describeIdentitySync(false, { status: 'NOT_SYNCED', failureReason: null }),
    ).toMatchObject({
      label: 'Sign-in not yet disabled',
      offerSync: true,
    });
  });

  it('shows a pending change as in progress, with the reason when it is retrying', () => {
    expect(describeIdentitySync(false, { status: 'PENDING', failureReason: null })?.label).toBe(
      'Disabling sign-in…',
    );
    expect(
      describeIdentitySync(true, { status: 'PENDING', failureReason: 'KEYCLOAK_ADMIN_UNREACHABLE' })
        ?.detail,
    ).toMatch(/retrying/i);
  });
});
