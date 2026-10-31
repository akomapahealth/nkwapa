import {
  STAFF_INVITE_TTL_CHOICES,
  DEFAULT_STAFF_INVITE_TTL_HOURS,
  describeStaffInviteIdentity,
  describeStaffInviteStatus,
  filterStaffInvites,
  formatStaffRole,
  type StaffInvite,
} from './staff-invite';

describe('staff invitation wording', () => {
  it('offers the lifetimes the API accepts, with 3 days as the default', () => {
    expect(STAFF_INVITE_TTL_CHOICES.map((choice) => choice.hours)).toEqual([24, 72, 168]);
    expect(DEFAULT_STAFF_INVITE_TTL_HOURS).toBe(72);
  });

  it('never shows a raw role enum', () => {
    expect(formatStaffRole('VOLUNTEER')).toBe('Volunteer');
    expect(formatStaffRole('SYSTEM_ADMIN')).toBe('System Admin');
  });

  // Cancelled and expired invitations stay visible, so each needs words of its own.
  it.each(['PENDING', 'ACCEPTED', 'CANCELLED', 'EXPIRED'])('describes %s', (status) => {
    const described = describeStaffInviteStatus(status);
    expect(described.label).not.toBe(status);
    expect(described.detail.length).toBeGreaterThan(0);
  });

  // This surface is about colleagues; the patient chart's wording would be wrong here.
  it('never talks about a patient', () => {
    for (const status of [
      'PROVISIONED',
      'EXISTING_PENDING',
      'ALREADY_ACTIVE',
      'SKIPPED',
      'FAILED',
    ]) {
      const described = describeStaffInviteIdentity({
        status,
        provisionedAt: null,
        failureReason: 'APP_PUBLIC_URL_UNSET',
      });
      expect(described?.detail).not.toMatch(/patient/i);
    }
  });

  it('says nothing when no account was requested', () => {
    expect(
      describeStaffInviteIdentity({
        status: 'NOT_REQUESTED',
        provisionedAt: null,
        failureReason: null,
      }),
    ).toBeNull();
  });
});

describe('filterStaffInvites', () => {
  const invite = (id: string, status: string, email: string, inviteeName: string | null = null) =>
    ({ id, status, email, inviteeName }) as StaffInvite;
  const invites = [
    invite('a', 'PENDING', 'ama@clinic.org', 'Ama K. Mensah'),
    invite('b', 'ACCEPTED', 'kofi@clinic.org'),
    invite('c', 'CANCELLED', 'esi@clinic.org'),
    invite('d', 'EXPIRED', 'yaw@clinic.org'),
  ];
  const ids = (list: StaffInvite[]) => list.map((item) => item.id);

  it('groups cancelled and expired as closed', () => {
    expect(ids(filterStaffInvites(invites, { filter: 'OPEN', query: '' }))).toEqual(['a']);
    expect(ids(filterStaffInvites(invites, { filter: 'ACCEPTED', query: '' }))).toEqual(['b']);
    expect(ids(filterStaffInvites(invites, { filter: 'CLOSED', query: '' }))).toEqual(['c', 'd']);
    expect(ids(filterStaffInvites(invites, { filter: 'ALL', query: '' }))).toHaveLength(4);
  });

  it('searches name and email, ignoring case and spaces', () => {
    expect(ids(filterStaffInvites(invites, { filter: 'ALL', query: ' MENSAH ' }))).toEqual(['a']);
    expect(ids(filterStaffInvites(invites, { filter: 'ALL', query: 'kofi@' }))).toEqual(['b']);
    expect(filterStaffInvites(invites, { filter: 'OPEN', query: 'kofi' })).toEqual([]);
  });
});
