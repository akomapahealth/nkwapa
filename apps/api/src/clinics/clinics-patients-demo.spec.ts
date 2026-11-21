import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ClinicsPatientsController } from './clinics-patients.controller';

const CLINIC = 'clinic-1';

function setup() {
  const patientService = {
    create: jest.fn(async () => ({ id: 'patient-1' })),
    update: jest.fn(async () => ({ id: 'patient-1' })),
    findById: jest.fn(async () => ({ id: 'patient-1', primaryClinicId: CLINIC })),
  };
  const controller = new ClinicsPatientsController(
    patientService as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { controller, patientService };
}

const req = (role: UserRole) => ({
  user: { user: { id: 'user-1' }, roles: [{ clinicId: CLINIC, role }] },
});

const body = { firstName: 'Ama', lastName: 'Demo', nationalIdType: 'NONE' } as never;

describe('marking a patient as demo data', () => {
  it('lets a director set the mark and refuses a volunteer or manager', async () => {
    const { controller, patientService } = setup();
    await controller.update(
      { clinicId: CLINIC, patientId: 'patient-1' } as never,
      { isDemo: true },
      req(UserRole.DIRECTOR),
    );
    expect(patientService.update).toHaveBeenCalledWith(
      'patient-1',
      { isDemo: true },
      expect.anything(),
    );

    for (const role of [UserRole.VOLUNTEER, UserRole.MANAGER]) {
      await expect(
        controller.create(
          { clinicId: CLINIC } as never,
          { ...(body as object), isDemo: true } as never,
          req(role),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  it('leaves an ordinary registration alone', async () => {
    const { controller, patientService } = setup();
    await controller.create({ clinicId: CLINIC } as never, body, req(UserRole.VOLUNTEER));
    expect(patientService.create).toHaveBeenCalled();
  });
});
