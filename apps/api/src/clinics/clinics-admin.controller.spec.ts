import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ClinicsAdminController } from './clinics-admin.controller';

describe('ClinicsAdminController', () => {
  const clinicService = {
    listAllForAdmin: jest.fn().mockResolvedValue([{ id: 'clinic-1', name: 'Clinic One' }]),
    create: jest.fn(),
    canManageClinic: jest.fn(),
    findByIdForAdmin: jest.fn(),
    update: jest.fn(),
  };

  const prisma = {
    userClinicRole: {
      create: jest.fn(),
    },
  };

  const controller = new ClinicsAdminController(
    clinicService as never,
    prisma as never
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects managers from listing clinic administration data', async () => {
    await expect(
      controller.listAll({
        user: {
          user: { id: 'manager-1' },
          roles: [{ clinicId: 'clinic-1', role: UserRole.MANAGER }],
        },
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows directors to list clinics they can administer', async () => {
    await expect(
      controller.listAll({
        user: {
          user: { id: 'director-1' },
          roles: [{ clinicId: 'clinic-1', role: UserRole.DIRECTOR }],
        },
      })
    ).resolves.toEqual([{ id: 'clinic-1', name: 'Clinic One' }]);
  });
});
