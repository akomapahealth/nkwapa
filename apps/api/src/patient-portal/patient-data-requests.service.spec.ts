import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PatientDataRequestStatus, PatientDataRequestType } from '@prisma/client';
import {
  DATA_REQUEST_RESPONSE_DAYS,
  PatientDataRequestsService,
} from './patient-data-requests.service';

describe('PatientDataRequestsService', () => {
  function setup(existing: Record<string, unknown> | null = null) {
    const prisma = {
      patientDataRequest: {
        findFirst: jest.fn().mockResolvedValue(existing),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }) => ({
          id: 'req-1',
          status: 'RECEIVED',
          responseNote: null,
          respondedAt: null,
          createdAt: new Date(),
          ...data,
        })),
        update: jest.fn().mockImplementation(({ data }) => ({ ...existing, ...data })),
      },
    };
    const audit = { logWrite: jest.fn().mockResolvedValue(undefined) };
    const portal = { resolvePortalPatient: jest.fn().mockResolvedValue({ id: 'patient-1' }) };
    const service = new PatientDataRequestsService(
      prisma as never,
      audit as never,
      portal as never,
    );
    return { service, prisma, audit, portal };
  }

  describe('a patient filing a request', () => {
    it('records it against their own record, due in 30 days, audited without their words', async () => {
      const { service, prisma, audit } = setup();
      const before = Date.now();

      const result = await service.createForPatient('clinic-1', 'user-1', {
        type: PatientDataRequestType.DELETION,
        details: '  Please remove my old phone number  ',
      });

      const data = prisma.patientDataRequest.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        clinicId: 'clinic-1',
        patientId: 'patient-1',
        requestedByUserId: 'user-1',
        type: 'DELETION',
        details: 'Please remove my old phone number',
      });
      const days = (data.dueAt.getTime() - before) / 86_400_000;
      expect(Math.round(days)).toBe(DATA_REQUEST_RESPONSE_DAYS);
      expect(audit.logWrite.mock.calls[0][0].afterJson).not.toContain('phone');
      expect(result).not.toHaveProperty('requestedByUserId');
    });

    it('refuses a second open request of the same kind', async () => {
      const { service, prisma } = setup({ id: 'open-1' });
      await expect(
        service.createForPatient('clinic-1', 'user-1', { type: PatientDataRequestType.ACCESS }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.patientDataRequest.create).not.toHaveBeenCalled();
    });
  });

  describe('the clinic answering', () => {
    const open = { id: 'req-1', clinicId: 'clinic-1', status: 'RECEIVED', responseNote: null };

    it('requires a note to the patient when completing or declining', async () => {
      const { service, prisma } = setup(open);
      await expect(
        service.respond('clinic-1', 'req-1', 'staff-1', {
          status: PatientDataRequestStatus.DECLINED,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.patientDataRequest.update).not.toHaveBeenCalled();
    });

    it('records who closed it and when', async () => {
      const { service, prisma, audit } = setup(open);
      await service.respond('clinic-1', 'req-1', 'staff-1', {
        status: PatientDataRequestStatus.DECLINED,
        responseNote: 'Medical records must be kept; your phone number was removed.',
      });
      const data = prisma.patientDataRequest.update.mock.calls[0][0].data;
      expect(data).toMatchObject({ status: 'DECLINED', respondedByUserId: 'staff-1' });
      expect(data.respondedAt).toBeInstanceOf(Date);
      expect(audit.logWrite.mock.calls[0][0].action).toBe('PATIENT.DATA_REQUEST.RESPOND');
    });

    it('marks one in progress without a note or a responder', async () => {
      const { service, prisma } = setup(open);
      await service.respond('clinic-1', 'req-1', 'staff-1', {
        status: PatientDataRequestStatus.IN_PROGRESS,
      });
      expect(prisma.patientDataRequest.update.mock.calls[0][0].data).not.toHaveProperty(
        'respondedByUserId',
      );
    });

    it('will not reopen an answered request, nor touch another clinic', async () => {
      await expect(
        setup({ ...open, status: 'COMPLETED' }).service.respond('clinic-1', 'req-1', 's', {
          status: PatientDataRequestStatus.IN_PROGRESS,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      const other = setup(null);
      await expect(
        other.service.respond('clinic-2', 'req-1', 's', {
          status: PatientDataRequestStatus.IN_PROGRESS,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(other.prisma.patientDataRequest.findFirst).toHaveBeenCalledWith({
        where: { id: 'req-1', clinicId: 'clinic-2' },
      });
    });
  });
});
