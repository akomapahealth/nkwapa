import { Reflector } from '@nestjs/core';
import { AdminController } from '../admin/admin.controller';
import { ClinicsPatientsController } from '../clinics/clinics-patients.controller';
import { PERMISSIONS } from '../auth/constants/permissions';

/**
 * The routes that reach `PatientMergeService`.
 *
 * Guards are not exercised here -- the suite has no HTTP layer -- so what these assert is the
 * metadata the guards read plus the arguments each route forwards. Authorization itself is
 * proved in `patient-merge.service.spec.ts`, which is also the layer that would still refuse if
 * a decorator were removed.
 */
describe('patient merge routes', () => {
  const reflector = new Reflector();
  const request = {
    user: { user: { id: 'sysadmin-1' }, roles: [{ clinicId: null, role: 'SYSTEM_ADMIN' }] },
    headers: { 'x-request-id': 'req-1' },
  };

  function permissionOf(target: object, handler: string): string | undefined {
    return reflector.get<string>(
      'requirePermission',
      (target as Record<string, () => unknown>)[handler],
    );
  }

  describe('the chart-scoped preview', () => {
    const patientMergeService = { preview: jest.fn().mockResolvedValue({ canMerge: true }) };
    const controller = new ClinicsPatientsController(
      {} as never,
      {} as never,
      {} as never,
      patientMergeService as never,
    );

    beforeEach(() => jest.clearAllMocks());

    it('requires the merge permission, which no role but the wildcard holds', () => {
      expect(permissionOf(ClinicsPatientsController.prototype, 'previewMerge')).toBe(
        PERMISSIONS.PATIENT_MERGE,
      );
    });

    it('previews against the chart in the path, not one named in the query', async () => {
      await controller.previewMerge(
        { clinicId: 'clinic-1', patientId: 'patient-1' },
        { sourcePatientId: 'patient-2' },
        request as never,
      );

      expect(patientMergeService.preview).toHaveBeenCalledWith(
        { userId: 'sysadmin-1', roles: request.user.roles },
        'patient-1',
        'patient-2',
        { portalLinkStrategy: undefined, inviteStrategy: undefined },
      );
    });

    it('passes the strategies through, so the panel can answer a different question', async () => {
      await controller.previewMerge(
        { clinicId: 'clinic-1', patientId: 'patient-1' },
        { sourcePatientId: 'patient-2', portalLinkStrategy: 'SOURCE', inviteStrategy: 'CANONICAL' },
        request as never,
      );

      expect(patientMergeService.preview).toHaveBeenCalledWith(
        expect.anything(),
        'patient-1',
        'patient-2',
        { portalLinkStrategy: 'SOURCE', inviteStrategy: 'CANONICAL' },
      );
    });
  });

  describe('the admin routes', () => {
    const patientMergeService = {
      preview: jest.fn().mockResolvedValue({ canMerge: true }),
      merge: jest.fn().mockResolvedValue({ success: true }),
    };
    const controller = new AdminController({} as never, {} as never, patientMergeService as never);

    beforeEach(() => jest.clearAllMocks());

    /*
      The gap this closes. Merge used to sit behind the class-level CLINIC_MANAGE, which a
      director and a manager both hold, so they reached the service and were refused there. The
      refusal is now at the guard, and the service still refuses independently.
    */
    it('lifts both merge routes off the class-level CLINIC_MANAGE', () => {
      expect(reflector.get<string>('requirePermission', AdminController)).toBe(
        PERMISSIONS.CLINIC_MANAGE,
      );
      for (const handler of ['previewMerge', 'mergePatients']) {
        expect(permissionOf(AdminController.prototype, handler)).toBe(PERMISSIONS.PATIENT_MERGE);
      }
    });

    it('takes both chart ids from the query, since no clinic scopes the request', async () => {
      await controller.previewMerge(
        { canonicalPatientId: 'patient-1', sourcePatientId: 'patient-2' },
        request as never,
      );

      expect(patientMergeService.preview).toHaveBeenCalledWith(
        { userId: 'sysadmin-1', roles: request.user.roles },
        'patient-1',
        'patient-2',
        { portalLinkStrategy: undefined, inviteStrategy: undefined },
      );
    });

    it('forwards the preview fingerprint so a stale panel cannot be committed', async () => {
      await controller.mergePatients(
        {
          canonicalPatientId: 'patient-1',
          sourcePatientId: 'patient-2',
          previewFingerprint: 'abcdef0123456789',
        },
        request as never,
      );

      expect(patientMergeService.merge).toHaveBeenCalledWith(
        { userId: 'sysadmin-1', roles: request.user.roles },
        'patient-1',
        'patient-2',
        expect.objectContaining({ expectedFingerprint: 'abcdef0123456789' }),
        'req-1',
      );
    });
  });
});
