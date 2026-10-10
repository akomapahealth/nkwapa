import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { UserRole } from '@prisma/client';
import { CLINICAL_RECORD_SURFACES, roleHolds } from '../testing/clinical-record-surfaces';
import { renderRoleMatrix } from '../testing/role-matrix-doc';
import { SYNC_ENTITY_PERMISSIONS } from '../sync/sync-permissions';
import { hasPermissionAtClinic } from './clinic-roles';
import { CLINIC_A1, CLINIC_B1, CROSS_CLINIC_MANAGER_VOLUNTEER } from '../testing/rbac-harness';

const DOC_PATH = resolve(__dirname, '../../../../docs/security/clinical-records-role-matrix.md');

describe('clinical record role matrix', () => {
  it('matches the published document', () => {
    // Regenerate with: npm run docs:role-matrix --workspace=@nkwapa/api
    expect(readFileSync(DOC_PATH, 'utf8')).toBe(renderRoleMatrix());
  });

  describe.each(CLINICAL_RECORD_SURFACES.map((s) => [s.label, s] as const))(
    '%s',
    (_label, surface) => {
      it('is readable by every clinic-scoped staff role that can act on it', () => {
        // Any role allowed to record a clinical value must be able to read it back. A volunteer
        // once held SCREENING.WRITE without SCREENING.READ and could not see what they recorded.
        for (const role of [UserRole.DOCTOR, UserRole.VOLUNTEER]) {
          if (roleHolds(role, surface.write)) {
            expect(roleHolds(role, surface.read)).toBe(true);
          }
        }
      });

      it('is never reachable by a portal patient', () => {
        expect(roleHolds(UserRole.PATIENT, surface.read)).toBe(false);
        expect(roleHolds(UserRole.PATIENT, surface.write)).toBe(false);
        for (const extra of surface.additional ?? []) {
          expect(roleHolds(UserRole.PATIENT, extra.permission)).toBe(false);
        }
      });

      it('requires the same permission offline as online', () => {
        for (const entityType of surface.syncEntityTypes) {
          const policy = SYNC_ENTITY_PERMISSIONS[entityType];
          // `patient` splits create from update, so its write column names the stricter of the two.
          expect([policy.create, policy.update]).toContain(surface.write);
        }
      });

      it('does not let a seat at another clinic authorize it here', () => {
        for (const permission of [surface.read, surface.write]) {
          const grantedHere = hasPermissionAtClinic(
            CROSS_CLINIC_MANAGER_VOLUNTEER.roles,
            CLINIC_A1,
            permission,
          );
          const grantedThere = hasPermissionAtClinic(
            CROSS_CLINIC_MANAGER_VOLUNTEER.roles,
            CLINIC_B1,
            permission,
          );
          // The manager seat at A1 must decide A1; the volunteer seat at B1 must decide B1.
          expect(grantedHere).toBe(roleHolds(UserRole.MANAGER, permission));
          expect(grantedThere).toBe(roleHolds(UserRole.VOLUNTEER, permission));
        }
      });
    },
  );

  describe('the clinical access boundary', () => {
    it('keeps note content with doctors and volunteers only', () => {
      const notes = CLINICAL_RECORD_SURFACES.find((s) => s.id === 'clinical-notes')!;
      for (const role of [UserRole.DIRECTOR, UserRole.MANAGER]) {
        expect(roleHolds(role, notes.read)).toBe(false);
        expect(roleHolds(role, notes.write)).toBe(false);
      }
      for (const role of [UserRole.DOCTOR, UserRole.VOLUNTEER]) {
        expect(roleHolds(role, notes.read)).toBe(true);
      }
    });

    it('gives managers and directors status-only note data', () => {
      const statusOnly = 'CLINICAL_NOTE.STATUS.READ';
      for (const role of [UserRole.DIRECTOR, UserRole.MANAGER]) {
        expect(roleHolds(role, statusOnly)).toBe(true);
      }
    });

    it('reserves cosigning and addenda for doctors', () => {
      for (const permission of ['CLINICAL_NOTE.COSIGN', 'CLINICAL_NOTE.ADDENDUM']) {
        expect(roleHolds(UserRole.DOCTOR, permission)).toBe(true);
        expect(roleHolds(UserRole.VOLUNTEER, permission)).toBe(false);
        expect(roleHolds(UserRole.MANAGER, permission)).toBe(false);
        expect(roleHolds(UserRole.DIRECTOR, permission)).toBe(false);
      }
    });

    it('gives directors and managers read access to general clinical records', () => {
      // Policy: general clinical records are visible to the clinic-scoped staff roles. Notes are
      // the documented exception above.
      for (const id of ['medical-history', 'diabetes', 'medication-reconciliation']) {
        const surface = CLINICAL_RECORD_SURFACES.find((s) => s.id === id)!;
        expect(roleHolds(UserRole.DIRECTOR, surface.read)).toBe(true);
        expect(roleHolds(UserRole.MANAGER, surface.read)).toBe(true);
        expect(roleHolds(UserRole.DIRECTOR, surface.write)).toBe(false);
        expect(roleHolds(UserRole.MANAGER, surface.write)).toBe(false);
      }
    });
  });
});
