import { UserRole } from '@prisma/client';
import {
  DEFAULT_STAFF_INVITE_TTL_HOURS,
  acceptableStaffInviteWhere,
  buildStaffInviteRedirectUri,
  effectiveStaffInviteStatus,
  invitableRolesFor,
  isSharedMailboxAddress,
  isStaffInviteExpired,
  resolveStaffInviteExpiry,
} from './staff-invite-lifecycle';

const CLINIC_A = 'clinic-a';
const CLINIC_B = 'clinic-b';
const HOUR = 60 * 60 * 1000;

describe('staff invitation lifecycle', () => {
  describe('the role ceiling', () => {
    it('lets a system admin invite every invitable role into any clinic', () => {
      const roles = [{ clinicId: null, role: UserRole.SYSTEM_ADMIN }];
      expect(invitableRolesFor(roles, CLINIC_B)).toEqual([
        UserRole.MANAGER,
        UserRole.DOCTOR,
        UserRole.VOLUNTEER,
      ]);
    });

    it('lets a director invite into the clinic they direct', () => {
      const roles = [{ clinicId: CLINIC_A, role: UserRole.DIRECTOR }];
      expect(invitableRolesFor(roles, CLINIC_A)).toEqual([
        UserRole.MANAGER,
        UserRole.DOCTOR,
        UserRole.VOLUNTEER,
      ]);
    });

    // The route parameter is the attacker's to choose; the ceiling reads the actor's own rows.
    it('gives a director nothing in a clinic they do not direct', () => {
      const roles = [
        { clinicId: CLINIC_A, role: UserRole.DIRECTOR },
        { clinicId: CLINIC_B, role: UserRole.DOCTOR },
      ];
      expect(invitableRolesFor(roles, CLINIC_B)).toEqual([]);
    });

    it('never offers DIRECTOR, SYSTEM_ADMIN or PATIENT, even to a system admin', () => {
      const offered = invitableRolesFor(
        [{ clinicId: null, role: UserRole.SYSTEM_ADMIN }],
        CLINIC_A,
      );
      expect(offered).not.toContain(UserRole.DIRECTOR);
      expect(offered).not.toContain(UserRole.SYSTEM_ADMIN);
      expect(offered).not.toContain(UserRole.PATIENT);
    });

    it.each([UserRole.MANAGER, UserRole.DOCTOR, UserRole.VOLUNTEER, UserRole.PATIENT])(
      'gives a %s nothing to invite',
      (role) => {
        expect(invitableRolesFor([{ clinicId: CLINIC_A, role }], CLINIC_A)).toEqual([]);
      },
    );

    // A clinic-scoped row that happens to say SYSTEM_ADMIN is not the global seat.
    it('does not treat a clinic-scoped SYSTEM_ADMIN row as the global seat', () => {
      expect(
        invitableRolesFor([{ clinicId: CLINIC_A, role: UserRole.SYSTEM_ADMIN }], CLINIC_B),
      ).toEqual([]);
    });
  });

  describe('expiry', () => {
    const now = new Date('2026-09-25T12:00:00Z');

    it('defaults to 72 hours', () => {
      expect(resolveStaffInviteExpiry(undefined, now).getTime() - now.getTime()).toBe(
        DEFAULT_STAFF_INVITE_TTL_HOURS * HOUR,
      );
    });

    it('honours a selectable lifetime', () => {
      expect(resolveStaffInviteExpiry(168, now).getTime() - now.getTime()).toBe(168 * HOUR);
    });

    // A free-form number is how a six-month offer of clinical access gets issued by accident.
    it('falls back to the default for anything it does not offer', () => {
      expect(resolveStaffInviteExpiry(4000, now).getTime() - now.getTime()).toBe(72 * HOUR);
    });

    it('reads a lapsed pending invitation as expired before the sweep reaches it', () => {
      const lapsed = { status: 'PENDING', expiresAt: new Date(now.getTime() - 1) };
      expect(isStaffInviteExpired(lapsed, now)).toBe(true);
      expect(effectiveStaffInviteStatus(lapsed, now)).toBe('EXPIRED');
    });

    it('leaves a settled status alone', () => {
      const accepted = { status: 'ACCEPTED', expiresAt: new Date(now.getTime() - 1) };
      expect(effectiveStaffInviteStatus(accepted, now)).toBe('ACCEPTED');
    });
  });

  describe('shared mailboxes', () => {
    it.each(['info@clinic.org', 'Reception@clinic.org', 'info+accra@clinic.org', 'no-reply@x.org'])(
      'refuses %s',
      (email) => {
        expect(isSharedMailboxAddress(email)).toBe(true);
      },
    );

    it.each(['ama.mensah@clinic.org', 'information.desk.lead@clinic.org', 'kofi@info.org'])(
      'accepts %s',
      (email) => {
        expect(isSharedMailboxAddress(email)).toBe(false);
      },
    );
  });

  describe('matching an invitation to the person holding it', () => {
    const now = new Date('2026-09-25T12:00:00Z');

    it('matches a verified address, lower-cased, and only while open', () => {
      expect(acceptableStaffInviteWhere(' Ama@Clinic.org ', now)).toEqual({
        status: 'PENDING',
        expiresAt: { gt: now },
        email: 'ama@clinic.org',
      });
    });

    // An empty condition would match every invitation in the deployment.
    it.each([null, undefined, '', '   '])('is not expressible for %p', (email) => {
      expect(acceptableStaffInviteWhere(email, now)).toBeNull();
    });
  });

  it('sends Keycloak back to the acceptance page with the continue marker', () => {
    expect(buildStaffInviteRedirectUri('https://app.example')).toBe(
      'https://app.example/accept-invite?continue=1',
    );
  });
});
