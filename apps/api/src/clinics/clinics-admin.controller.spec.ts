import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ClinicsAdminController } from './clinics-admin.controller';

describe('ClinicsAdminController', () => {
  const clinicService = {
    listAllForAdmin: jest.fn().mockResolvedValue([{ id: 'clinic-1', name: 'Clinic One' }]),
    listOrganizations: jest.fn().mockResolvedValue([{ id: 'org-1', name: 'Nkwapa Health' }]),
    create: jest.fn().mockResolvedValue({ id: 'clinic-new' }),
    canManageClinic: jest.fn(),
    findByIdForAdmin: jest.fn(),
    update: jest.fn().mockResolvedValue({ id: 'clinic-1' }),
  };

  const prisma = {
    userClinicRole: {
      create: jest.fn(),
    },
  };

  const controller = new ClinicsAdminController(clinicService as never, prisma as never);

  const asSystemAdmin = {
    user: { user: { id: 'admin-1' }, roles: [{ clinicId: null, role: UserRole.SYSTEM_ADMIN }] },
  };
  const asDirector = {
    user: {
      user: { id: 'director-1' },
      roles: [{ clinicId: 'clinic-1', role: UserRole.DIRECTOR }],
    },
  };
  const asManager = {
    user: { user: { id: 'manager-1' }, roles: [{ clinicId: 'clinic-1', role: UserRole.MANAGER }] },
  };

  const fullMetadata = {
    name: 'Ridge Clinic',
    region: 'Greater Accra',
    countryCode: 'GH',
    organizationId: '11111111-1111-4111-8111-111111111111',
    timezone: 'Africa/Accra',
    locationCode: 'ridge-clinic',
    zoneCode: 'greater-accra',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects managers from listing clinic administration data', async () => {
    await expect(controller.listAll(asManager as never)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows directors to list clinics they can administer', async () => {
    await expect(controller.listAll(asDirector as never)).resolves.toEqual([
      { id: 'clinic-1', name: 'Clinic One' },
    ]);
  });

  describe('organizations', () => {
    it('is readable by an admin who can administer clinics', async () => {
      await expect(controller.listOrganizations(asSystemAdmin as never)).resolves.toEqual([
        { id: 'org-1', name: 'Nkwapa Health' },
      ]);
    });

    it('is closed to managers, like the rest of clinic administration', async () => {
      await expect(controller.listOrganizations(asManager as never)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('create', () => {
    it('forwards every metadata field rather than dropping it', async () => {
      await controller.create(fullMetadata as never, asSystemAdmin as never);

      // The bug this pins: the controller used to hand-map name/region/countryCode only, so
      // timezone, locationCode and zoneCode never reached the service.
      expect(clinicService.create).toHaveBeenCalledWith(expect.objectContaining(fullMetadata));
    });

    it('rejects managers', async () => {
      await expect(
        controller.create(fullMetadata as never, asManager as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(clinicService.create).not.toHaveBeenCalled();
    });

    it('gives a creating director the directorship of their new clinic', async () => {
      await controller.create(fullMetadata as never, asDirector as never);

      expect(prisma.userClinicRole.create).toHaveBeenCalledWith({
        data: { userId: 'director-1', clinicId: 'clinic-new', role: UserRole.DIRECTOR },
      });
    });

    it('does not self-grant for a system admin, who already has global scope', async () => {
      await controller.create(fullMetadata as never, asSystemAdmin as never);

      expect(prisma.userClinicRole.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    const params = { id: '22222222-2222-2222-2222-222222222222' };

    it('forwards every metadata field rather than dropping it', async () => {
      clinicService.canManageClinic.mockResolvedValue(true);
      clinicService.findByIdForAdmin.mockResolvedValue({ id: params.id });

      await controller.update(
        params as never,
        {
          timezone: 'Europe/London',
          locationCode: 'ridge',
          zoneCode: null,
          isActive: false,
        } as never,
        asSystemAdmin as never,
      );

      expect(clinicService.update).toHaveBeenCalledWith(
        params.id,
        expect.objectContaining({
          timezone: 'Europe/London',
          locationCode: 'ridge',
          zoneCode: null,
          isActive: false,
        }),
      );
    });

    it('refuses a clinic the actor cannot manage', async () => {
      clinicService.canManageClinic.mockResolvedValue(false);

      await expect(
        controller.update(params as never, fullMetadata as never, asDirector as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(clinicService.update).not.toHaveBeenCalled();
    });

    it('reports a clinic that does not exist', async () => {
      clinicService.canManageClinic.mockResolvedValue(true);
      clinicService.findByIdForAdmin.mockResolvedValue(null);

      await expect(
        controller.update(params as never, fullMetadata as never, asSystemAdmin as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
