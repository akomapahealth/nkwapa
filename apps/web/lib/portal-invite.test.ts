import {
  buildManualInviteInstructions,
  describeInviteContact,
  describeInviteDeliveryGap,
  describeInviteExpiry,
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
    [90 * 1000, 'Expires in 1 minute'],
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
