import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PERMISSIONS } from '../auth/constants/permissions';
import { EncountersByIdController } from './encounters-by-id.controller';

describe('EncountersByIdController security', () => {
  const encounterService = {
    findById: jest.fn(),
    finalize: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not allow a privileged role in another clinic to authorize encounter actions', async () => {
    encounterService.findById.mockResolvedValue({ id: 'enc-1', clinicId: 'clinic-a' });
    const controller = new EncountersByIdController(encounterService as never);

    await expect(
      controller.finalize('enc-1', {
        user: {
          user: { id: 'user-1' },
          roles: [
            { clinicId: 'clinic-a', role: UserRole.VOLUNTEER },
            { clinicId: 'clinic-b', role: UserRole.DOCTOR },
          ],
        },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(encounterService.finalize).not.toHaveBeenCalled();
  });

  it('allows a system admin global role after the encounter clinic is resolved', async () => {
    encounterService.findById.mockResolvedValue({ id: 'enc-1', clinicId: 'clinic-a' });
    encounterService.finalize.mockResolvedValue({ id: 'enc-1', status: 'FINALIZED' });
    const controller = new EncountersByIdController(encounterService as never);

    await expect(
      controller.finalize('enc-1', {
        user: {
          user: { id: 'admin-1' },
          roles: [{ clinicId: null, role: UserRole.SYSTEM_ADMIN }],
        },
      }),
    ).resolves.toEqual({ id: 'enc-1', status: 'FINALIZED' });

    expect(encounterService.finalize).toHaveBeenCalledWith(
      'enc-1',
      'admin-1',
      expect.objectContaining({
        clinicId: 'clinic-a',
        actorUserId: 'admin-1',
      }),
    );
  });

  it('keeps the requested permission bound to the resolved clinic', async () => {
    encounterService.findById.mockResolvedValue({ id: 'enc-1', clinicId: 'clinic-a' });
    const controller = new EncountersByIdController(encounterService as never);

    await expect(
      controller.findOne('enc-1', {
        user: {
          user: { id: 'user-1' },
          roles: [{ clinicId: 'clinic-a', role: UserRole.VOLUNTEER }],
        },
      }),
    ).resolves.toEqual({ id: 'enc-1', clinicId: 'clinic-a' });

    expect(PERMISSIONS.ENCOUNTER_READ).toBe('ENCOUNTER.READ');
  });
});
