import {
  buildManualInviteInstructions,
  describeInviteContact,
  describeInviteDeliveryGap,
  describeInviteExpiry,
  describeInviteIdentity,
  describeInviteStatus,
  describePortalAccessStatus,
  formatInviteDate,
  type PortalInvite,
} from './portal-invite';

const NOW = new Date('2026-09-02T12:00:00.000Z');
const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const invite = (overrides: Partial<PortalInvite> = {}): PortalInvite => ({
  id: 'invite-1',
  status: 'PENDING',
  email: 'ama@example.com',
  phoneE164: null,
  createdAt: at(-DAY),
  expiresAt: at(7 * DAY),
  claimedAt: null,
  cancelledAt: null,
  createdByName: 'Nurse Adjoa',
  emailDelivery: null,
  ...overrides,
});

describe('describePortalAccessStatus', () => {
  // The chart printed LINKED / INVITED / UNLINKED verbatim, twice. That is system
  // vocabulary on a clinical surface and says nothing about what to do next.
  it.each([
    ['LINKED', 'Portal account linked'],
    ['INVITED', 'Invitation waiting'],
    ['UNLINKED', 'No portal access'],
    ['MERGED', 'Chart merged'],
  ])('gives %s a plain-language label', (status, label) => {
    expect(describePortalAccessStatus(status).label).toBe(label);
  });

  it('never leaks a raw enum for an unrecognised status', () => {
    expect(describePortalAccessStatus('SOMETHING_NEW').label).toBe('No portal access');
  });

  it('always says what to do next', () => {
    for (const status of ['LINKED', 'INVITED', 'UNLINKED', 'MERGED']) {
      expect(describePortalAccessStatus(status).detail.length).toBeGreaterThan(0);
    }
  });
});

describe('describeInviteStatus', () => {
  it.each([
    ['PENDING', 'Waiting to be claimed', 'review'],
    ['CLAIMED', 'Claimed', 'finalized'],
    ['CANCELLED', 'Cancelled', 'draft'],
    ['EXPIRED', 'Expired', 'warning'],
  ])('describes %s', (status, label, variant) => {
    expect(describeInviteStatus(status)).toMatchObject({ label, variant });
  });

  // Expired is a closed window, not a failure. Colouring it destructive would put it in
  // the same visual class as an out-of-range clinical value.
  it('does not treat an expired invite as destructive', () => {
    expect(describeInviteStatus('EXPIRED').variant).not.toBe('destructive');
  });
});

describe('describeInviteExpiry', () => {
  it.each([
    [7 * DAY, 'Expires in 7 days'],
    [DAY, 'Expires in 1 day'],
    [3 * HOUR, 'Expires in 3 hours'],
    [HOUR, 'Expires in 1 hour'],
    [60 * 1000, 'Expires in 1 minute'],
  ])('counts down %i ms as "%s"', (offset, label) => {
    expect(describeInviteExpiry(at(offset), NOW).label).toBe(label);
  });

  it.each([
    [-2 * DAY, 'Expired 2 days ago'],
    [-DAY, 'Expired 1 day ago'],
    [-2 * HOUR, 'Expired 2 hours ago'],
  ])('counts up %i ms as "%s"', (offset, label) => {
    expect(describeInviteExpiry(at(offset), NOW)).toMatchObject({
      label,
      tone: 'expired',
      isExpired: true,
    });
  });

  // Truncating renders a seven-day invite as "6 days" the second it is created, directly
  // under the 7 the person just chose. This is the case that motivated rounding.
  it('does not lose a day the moment an invite is created', () => {
    const created = new Date(NOW.getTime() + 7 * DAY - 2000).toISOString();
    expect(describeInviteExpiry(created, NOW).label).toBe('Expires in 7 days');
  });

  // The unit is still chosen by the whole-unit threshold, so a gap under a day is not
  // rounded up into one.
  it('keeps hours as hours rather than rounding up to a day', () => {
    expect(describeInviteExpiry(at(23 * HOUR), NOW).label).toBe('Expires in 23 hours');
  });

  // The boundary the API uses is gt, so the expiry instant itself is over.
  it('treats the expiry instant itself as passed', () => {
    expect(describeInviteExpiry(at(0), NOW).isExpired).toBe(true);
  });

  // Warning before it becomes a problem: an invite the patient is unlikely to reach in
  // time should not look like one with a week left.
  it('warns inside the last day and not before', () => {
    expect(describeInviteExpiry(at(23 * HOUR), NOW).tone).toBe('warning');
    expect(describeInviteExpiry(at(25 * HOUR), NOW).tone).toBe('neutral');
  });

  it.each([null, 'not-a-date'])('says nothing alarming about %s', (value) => {
    expect(describeInviteExpiry(value, NOW)).toEqual({
      label: 'No expiry set',
      tone: 'neutral',
      isExpired: false,
    });
  });
});

describe('formatInviteDate', () => {
  it('falls back rather than rendering Invalid Date', () => {
    expect(formatInviteDate(null)).toBe('Not set');
    expect(formatInviteDate('nonsense')).toBe('Not set');
  });
});

describe('describeInviteContact', () => {
  it.each([
    [{ email: 'ama@example.com', phoneE164: null }, 'ama@example.com'],
    [{ email: null, phoneE164: '+233201234567' }, '+233201234567'],
    [{ email: 'ama@example.com', phoneE164: '+233201234567' }, 'ama@example.com · +233201234567'],
    [{ email: null, phoneE164: null }, 'No contact method'],
  ])('renders %o', (contact, expected) => {
    expect(describeInviteContact(contact)).toBe(expected);
  });
});

describe('buildManualInviteInstructions', () => {
  const base = {
    clinicName: 'Akomapa Clinic',
    patientCode: 'NKP-2026-000001',
    claimUrl: 'https://nkwapa.example/claim-record',
    expiresAt: at(7 * DAY),
  };

  it('carries the two things the patient cannot proceed without', () => {
    const text = buildManualInviteInstructions(base);

    expect(text).toContain('NKP-2026-000001');
    expect(text).toContain('https://nkwapa.example/claim-record');
  });

  // Without a configured public origin there is no honest address to give, and
  // "undefined/claim-record" is worse than saying nothing. Same rule the email template
  // already follows.
  it('omits the sign-in line rather than inventing an address', () => {
    const text = buildManualInviteInstructions({ ...base, claimUrl: null });

    expect(text).not.toContain('Sign in at');
    expect(text).toContain('NKP-2026-000001');
  });

  it('omits the validity line when there is no expiry', () => {
    expect(buildManualInviteInstructions({ ...base, expiresAt: null })).not.toContain(
      'Valid until',
    );
  });

  // This text gets pasted into WhatsApp. The code and the address are what the patient
  // needs; anything else is identifying detail travelling further than it should.
  it('carries no patient name or date of birth', () => {
    const text = buildManualInviteInstructions(base).toLowerCase();

    expect(text).not.toContain('date of birth:');
    expect(text).not.toContain('name');
  });
});

describe('describeInviteDeliveryGap', () => {
  const available = { available: true, readiness: 'smtp', reason: null };

  it('says nothing when an email invite is on its way', () => {
    expect(describeInviteDeliveryGap(invite(), available)).toBeNull();
  });

  // Three situations produced the same silence on the chart. Only one is worth chasing
  // an administrator about, so they must not read alike.
  it('distinguishes a phone-only invite from a broken mail server', () => {
    const phoneOnly = describeInviteDeliveryGap(
      invite({ email: null, phoneE164: '+233201234567' }),
      available,
    );
    const unconfigured = describeInviteDeliveryGap(invite(), {
      available: false,
      readiness: 'unconfigured',
      reason: 'SMTP_HOST is not set.',
    });

    expect(phoneOnly).toMatchObject({ tone: 'info' });
    expect(unconfigured).toMatchObject({ tone: 'warning', detail: 'SMTP_HOST is not set.' });
    expect(phoneOnly?.title).not.toBe(unconfigured?.title);
  });

  it('flags a send the mail server refused', () => {
    const gap = describeInviteDeliveryGap(
      invite({
        emailDelivery: {
          status: 'FAILED',
          failureReason: 'EMAIL_SEND_FAILED',
          sentAt: null,
          createdAt: at(0),
        },
      }),
      available,
    );

    expect(gap).toMatchObject({ tone: 'warning' });
  });

  it('says nothing when there is no invite at all', () => {
    expect(describeInviteDeliveryGap(null, available)).toBeNull();
  });
});

/*
  Whether there is an account behind the invitation.

  The chart could not answer this before. An invite could be created, emailed and marked
  delivered while no identity existed behind it, and the first anyone heard was a patient
  ringing to say the link did not work. Delivery and identity fail independently, so they
  are two facts on the chart rather than one.
*/
describe('describeInviteIdentity', () => {
  const withIdentity = (status: string, failureReason: string | null = null) =>
    describeInviteIdentity(invite({ identity: { status, provisionedAt: at(0), failureReason } }));

  it('says nothing for a phone-only invitation, which was never going to have one', () => {
    expect(describeInviteIdentity(invite({ identity: null, email: null }))).toBeNull();
  });

  it('says nothing for an invitation issued before this was recorded', () => {
    expect(withIdentity('NOT_REQUESTED')).toBeNull();
    expect(describeInviteIdentity(invite({ identity: undefined }))).toBeNull();
  });

  it('says nothing at all when there is no invitation', () => {
    expect(describeInviteIdentity(null)).toBeNull();
  });

  it('confirms a newly created account and says what the patient does next', () => {
    const result = withIdentity('PROVISIONED');
    expect(result).toMatchObject({ label: 'Account created', variant: 'finalized' });
    expect(result?.detail).toMatch(/secure link to choose a password/i);
  });

  /*
    The reassurance staff need before clicking resend. Resending reads Keycloak's own state
    and re-sends only what is outstanding, so a password the patient already chose survives.
  */
  it('reassures staff that a resend will not reset a chosen password', () => {
    const result = withIdentity('EXISTING_PENDING');
    expect(result).toMatchObject({ label: 'Account setup unfinished', variant: 'review' });
    expect(result?.detail).toMatch(/already chose is untouched/i);
  });

  it('explains why no password email went out to a patient who already has an account', () => {
    const result = withIdentity('ALREADY_ACTIVE');
    expect(result).toMatchObject({ label: 'Patient already has an account' });
    expect(result?.detail).toMatch(/no password email was sent/i);
  });

  it('warns, without alarming, when the server cannot create accounts at all', () => {
    const result = withIdentity('SKIPPED');
    expect(result).toMatchObject({ label: 'Account not created', variant: 'warning' });
    expect(result?.detail).toMatch(/invitation still stands/i);
  });

  describe('failures', () => {
    it.each([
      ['KEYCLOAK_ADMIN_TIMEOUT', /resend it in a few minutes/i],
      ['KEYCLOAK_ADMIN_UNREACHABLE', /resend it in a few minutes/i],
      ['KEYCLOAK_ADMIN_AUTH_FAILED', /administrator needs to check its credentials/i],
      ['IDENTITY_DISABLED', /has been disabled/i],
      ['APP_PUBLIC_URL_UNSET', /does not know its own public address/i],
    ])('turns %s into something staff can act on', (reason, expected) => {
      const result = withIdentity('FAILED', reason);
      expect(result?.variant).toBe('destructive');
      expect(result?.detail).toMatch(expected);
    });

    // The code is for whoever reads the logs. On a chart it is noise.
    it('never shows the raw code to staff', () => {
      for (const reason of ['KEYCLOAK_ADMIN_TIMEOUT', 'IDENTITY_DISABLED', 'SOMETHING_NEW']) {
        expect(withIdentity('FAILED', reason)?.detail).not.toContain(reason);
      }
    });

    it('still gives an actionable sentence for a code it has never seen', () => {
      const result = withIdentity('FAILED', 'A_CODE_FROM_A_NEWER_DEPLOY');
      expect(result?.detail).toMatch(/resend it/i);
    });
  });

  it('ignores a status a newer deployment added rather than rendering a blank badge', () => {
    expect(withIdentity('SOMETHING_NEW_ENTIRELY')).toBeNull();
  });
});

describe('buildManualInviteInstructions account setup wording', () => {
  const base = {
    clinicName: 'Cape Coast Clinic',
    patientCode: 'NKP-2026-000001',
    claimUrl: 'https://app.nkwapa.app/claim-record',
    expiresAt: null,
  };

  /*
    Staff read this aloud to the patient in front of them, so it has to be true of that
    patient. It used to say "create an account", which self-registration being disabled
    made impossible -- the same dead end the invite email carried.
  */
  it('never tells a patient to create an account, in any state', () => {
    for (const identityStatus of [
      'PROVISIONED',
      'EXISTING_PENDING',
      'ALREADY_ACTIVE',
      'SKIPPED',
      'FAILED',
      'NOT_REQUESTED',
      null,
    ]) {
      expect(buildManualInviteInstructions({ ...base, identityStatus })).not.toMatch(
        /create an account/i,
      );
    }
  });

  it('points a newly provisioned patient at the password email by name', () => {
    expect(buildManualInviteInstructions({ ...base, identityStatus: 'PROVISIONED' })).toContain(
      'Choose your Nkwapa password',
    );
  });

  it('tells a patient who already has an account simply to sign in', () => {
    const text = buildManualInviteInstructions({ ...base, identityStatus: 'ALREADY_ACTIVE' });
    expect(text).toMatch(/sign in with the email address/i);
    expect(text).not.toContain('Choose your Nkwapa password');
  });

  it('falls back to wording true of any invitation when nothing is known', () => {
    const text = buildManualInviteInstructions({ ...base, identityStatus: null });
    expect(text).toMatch(/ask the clinic if you cannot sign in yet/i);
  });

  it('keeps the patient code, which is the reason staff read this out', () => {
    expect(buildManualInviteInstructions({ ...base, identityStatus: 'PROVISIONED' })).toContain(
      'NKP-2026-000001',
    );
  });
});
