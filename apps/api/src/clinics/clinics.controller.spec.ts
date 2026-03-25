import { NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { DisabledUserException } from '../auth/disabled-user.exception';
import { ClinicsController } from './clinics.controller';

describe('ClinicsController', () => {
  const clinic = {
    id: 'clinic-1',
    name: 'Test Clinic',
    region: 'Greater Accra',
    countryCode: 'GH',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const clinicService = {
    findById: jest.fn(),
  };

  const controller = new ClinicsController(clinicService as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns a clinic when found', async () => {
    clinicService.findById.mockResolvedValue(clinic);

    await expect(
      controller.findOne('clinic-1', {
        user: {
          user: { id: 'user-1' },
          roles: [{ clinicId: 'clinic-1', role: UserRole.MANAGER }],
        },
      })
    ).resolves.toEqual(clinic);
  });

  it('throws NotFoundException when the clinic is missing', async () => {
    clinicService.findById.mockResolvedValue(null);

    await expect(
      controller.findOne('missing-clinic', {
        user: {
          user: { id: 'user-1' },
          roles: [{ clinicId: 'clinic-1', role: UserRole.MANAGER }],
        },
      })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reuses the same disabled-user payload for protected-route handling', () => {
    const error = new DisabledUserException();

    expect(error.getResponse()).toMatchObject({
      code: 'USER_DISABLED',
      message: 'User account is deactivated',
    });
  });
});
