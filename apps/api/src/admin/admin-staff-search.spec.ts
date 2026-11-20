import { ForbiddenException } from '@nestjs/common';
import type { UserRole } from '@prisma/client';
import { AdminService } from './admin.service';

const CLINIC = 'clinic-1';

function setup(rows: unknown[] = []) {
  const findMany = jest.fn().mockResolvedValue(rows);
  const service = new AdminService(
    { user: { findMany } } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, findMany };
}

const director = { userId: 'dir-1', roles: [{ clinicId: CLINIC, role: 'DIRECTOR' as UserRole }] };

describe('AdminService.searchClinicUsers (smart search)', () => {
  it('finds active staff at this clinic by name or email, with their roles here', async () => {
    const { service, findMany } = setup([
      {
        id: 'u-1',
        displayName: 'Kofi Boateng',
        email: 'kofi@clinic.org',
        clinicRoles: [{ role: 'DOCTOR' }],
      },
    ]);

    const result = await service.searchClinicUsers(director, CLINIC, '  kofi ');

    expect(result.items).toEqual([
      { id: 'u-1', displayName: 'Kofi Boateng', email: 'kofi@clinic.org', roles: ['DOCTOR'] },
    ]);
    const args = findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({
      isActive: true,
      clinicRoles: { some: { clinicId: CLINIC } },
      OR: [
        { displayName: { contains: 'kofi', mode: 'insensitive' } },
        { email: { contains: 'kofi', mode: 'insensitive' } },
      ],
    });
    expect(args.take).toBe(5);
  });

  it('does not query for fewer than two characters', async () => {
    const { service, findMany } = setup();
    await expect(service.searchClinicUsers(director, CLINIC, 'k')).resolves.toEqual({ items: [] });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('refuses a clinic the actor has no role at', async () => {
    const { service } = setup();
    await expect(service.searchClinicUsers(director, 'clinic-2', 'kofi')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
