import {
  DEFAULT_PORTAL_INVITE_TTL_DAYS,
  PORTAL_CLAIM_PATH,
  buildPortalClaimRedirectUri,
  buildPortalClaimUrl,
  resolveIdentityActionLifespanSeconds,
  claimableInviteForIdentityWhere,
  claimableInviteWhere,
  effectivePortalInviteStatus,
  inviteIdentityMatchConditions,
  isPortalInviteExpired,
  resolvePortalInviteExpiry,
  resolvePortalInviteTtlDays,
} from './portal-invite-lifecycle';

const NOW = new Date('2026-09-02T12:00:00.000Z');
const day = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);

describe('resolvePortalInviteTtlDays', () => {
  it('falls back to the documented default when nothing is configured', () => {
    expect(resolvePortalInviteTtlDays({})).toBe(DEFAULT_PORTAL_INVITE_TTL_DAYS);
  });

  it('reads the configured value', () => {
    expect(resolvePortalInviteTtlDays({ PORTAL_INVITE_TTL_DAYS: '21' })).toBe(21);
  });

  // A clinic must not lose the ability to issue invites because someone fat-fingered an
  // environment variable. Clamping keeps the feature working and stays inside a sane band.
  it.each([
    ['0', 1],
    ['-5', 1],
    ['4000', 90],
  ])('clamps %s to %i rather than refusing to issue invites', (raw, expected) => {
    expect(resolvePortalInviteTtlDays({ PORTAL_INVITE_TTL_DAYS: raw })).toBe(expected);
  });

  it('ignores a value that is not a number', () => {
    expect(resolvePortalInviteTtlDays({ PORTAL_INVITE_TTL_DAYS: 'soon' })).toBe(
      DEFAULT_PORTAL_INVITE_TTL_DAYS,
    );
  });
});

describe('resolvePortalInviteExpiry', () => {
  it('prefers an explicit instant over everything else', () => {
    const explicit = day(3);
    expect(resolvePortalInviteExpiry({ expiresAt: explicit, ttlDays: 30 }, NOW, {})).toEqual(
      explicit,
    );
  });

  it('uses the requested lifetime when no instant was given', () => {
    expect(resolvePortalInviteExpiry({ ttlDays: 7 }, NOW, {})).toEqual(day(7));
  });

  it('falls back to the deployment default', () => {
    expect(resolvePortalInviteExpiry({}, NOW, {})).toEqual(day(DEFAULT_PORTAL_INVITE_TTL_DAYS));
    expect(resolvePortalInviteExpiry({}, NOW, { PORTAL_INVITE_TTL_DAYS: '30' })).toEqual(day(30));
  });

  // There is no "never expires" branch. An invite created under this rule always has one.
  it('never returns null', () => {
    expect(resolvePortalInviteExpiry({ expiresAt: null, ttlDays: null }, NOW, {})).toBeInstanceOf(
      Date,
    );
  });
});

describe('isPortalInviteExpired', () => {
  it('treats an invite whose expiry instant has arrived as expired', () => {
    expect(isPortalInviteExpired({ status: 'PENDING', expiresAt: NOW }, NOW)).toBe(true);
  });

  it('leaves an invite with time left alone', () => {
    expect(isPortalInviteExpired({ status: 'PENDING', expiresAt: day(1) }, NOW)).toBe(false);
  });

  // Rows predating the expiry rule are open-ended by construction; the backfill migration
  // removes them, not this predicate.
  it('does not expire an open-ended invite', () => {
    expect(isPortalInviteExpired({ status: 'PENDING', expiresAt: null }, NOW)).toBe(false);
  });

  it.each(['CLAIMED', 'CANCELLED', 'EXPIRED'])(
    'leaves a %s invite in its settled state',
    (status) => {
      expect(isPortalInviteExpired({ status, expiresAt: day(-30) }, NOW)).toBe(false);
    },
  );
});

describe('effectivePortalInviteStatus', () => {
  // The sweep runs hourly, so a lapsed row still reads PENDING for up to an hour. Showing
  // that to staff would promise a claim path the API already refuses.
  it('reports a lapsed but unswept row as expired', () => {
    expect(effectivePortalInviteStatus({ status: 'PENDING', expiresAt: day(-1) }, NOW)).toBe(
      'EXPIRED',
    );
  });

  it('passes settled statuses through unchanged', () => {
    expect(effectivePortalInviteStatus({ status: 'CLAIMED', expiresAt: day(-1) }, NOW)).toBe(
      'CLAIMED',
    );
    expect(effectivePortalInviteStatus({ status: 'CANCELLED', expiresAt: null }, NOW)).toBe(
      'CANCELLED',
    );
  });
});

describe('claimableInviteWhere', () => {
  it('admits only pending invites that have not lapsed', () => {
    expect(claimableInviteWhere(NOW)).toEqual({
      status: 'PENDING',
      OR: [{ expiresAt: null }, { expiresAt: { gt: NOW } }],
    });
  });
});

describe('inviteIdentityMatchConditions', () => {
  it('matches email case-insensitively and phone exactly', () => {
    expect(
      inviteIdentityMatchConditions({ email: 'Ama@example.com', phoneE164: '+233201234567' }),
    ).toEqual([
      { email: { equals: 'Ama@example.com', mode: 'insensitive' } },
      { phoneE164: '+233201234567' },
    ]);
  });

  // An empty OR matches every row, so callers have to read this as "no invites" rather
  // than "no filter". Returning the empty array makes that check impossible to skip.
  it('returns nothing to match on when the person has no contact details', () => {
    expect(inviteIdentityMatchConditions({ email: null, phoneE164: null })).toEqual([]);
  });
});

describe('claimableInviteForIdentityWhere', () => {
  // Both halves of this predicate want the OR key. Written by hand as a spread plus an
  // OR, the identity clause overwrites the expiry clause and the filter silently reverts
  // to matching every pending invite regardless of age. Nesting is the point.
  it('keeps the expiry clause and the identity clause both in force', () => {
    expect(claimableInviteForIdentityWhere({ email: 'ama@example.com' }, NOW)).toEqual({
      status: 'PENDING',
      AND: [
        { OR: [{ expiresAt: null }, { expiresAt: { gt: NOW } }] },
        { OR: [{ email: { equals: 'ama@example.com', mode: 'insensitive' } }] },
      ],
    });
  });

  // Null rather than an unfiltered clause: an empty OR matches everything, so a person
  // with no contact details would otherwise be handed every invite in the deployment.
  it('refuses to build a filter for someone with no contact details', () => {
    expect(claimableInviteForIdentityWhere({}, NOW)).toBeNull();
  });
});

describe('claim URLs', () => {
  it('points the invite email at the claim route', () => {
    expect(buildPortalClaimUrl('https://app.nkwapa.app')).toBe(
      'https://app.nkwapa.app/claim-record',
    );
  });

  /*
    The redirect carries continue=1 while the invite link does not, and the difference
    matters. Silent check-sso runs in an iframe and is blocked by the third-party cookie
    defaults in Safari and Firefox, so a patient returning from Keycloak with a live session
    still reads as signed out. The marker is what tells the app to redirect at the top level
    instead of waiting for a click the patient has no reason to expect.
  */
  it('marks the return from Keycloak so sign-in can continue without a click', () => {
    expect(buildPortalClaimRedirectUri('https://app.nkwapa.app')).toBe(
      'https://app.nkwapa.app/claim-record?continue=1',
    );
  });

  it('keeps both on the same route, so only the marker differs', () => {
    const origin = 'https://app.nkwapa.app';
    expect(buildPortalClaimRedirectUri(origin).startsWith(buildPortalClaimUrl(origin))).toBe(true);
    expect(PORTAL_CLAIM_PATH).toBe('/claim-record');
  });
});

describe('resolveIdentityActionLifespanSeconds', () => {
  const now = new Date('2026-09-02T12:00:00.000Z');
  const inDays = (days: number) => new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  /*
    The account-setup link and the invitation have to die together. Outlive the invite and a
    patient can choose a password and then be refused at the claim step, which reads as a
    broken product rather than an expired invitation.
  */
  it('lives exactly as long as the invitation it belongs to', () => {
    expect(resolveIdentityActionLifespanSeconds(inDays(14), now)).toBe(14 * 24 * 60 * 60);
    expect(resolveIdentityActionLifespanSeconds(inDays(7), now)).toBe(7 * 24 * 60 * 60);
  });

  it('falls back to the deployment default for a legacy invite with no expiry', () => {
    expect(resolveIdentityActionLifespanSeconds(null, now)).toBe(
      DEFAULT_PORTAL_INVITE_TTL_DAYS * 24 * 60 * 60,
    );
  });

  // Minting a link that is already useless helps nobody; an hour is enough to act on.
  it('never mints a link shorter than an hour', () => {
    expect(resolveIdentityActionLifespanSeconds(inDays(-5), now)).toBe(60 * 60);
    expect(resolveIdentityActionLifespanSeconds(new Date(now.getTime() + 60_000), now)).toBe(
      60 * 60,
    );
  });

  it('caps at the longest invite the deployment can issue', () => {
    expect(resolveIdentityActionLifespanSeconds(inDays(365), now)).toBe(90 * 24 * 60 * 60);
  });
});
