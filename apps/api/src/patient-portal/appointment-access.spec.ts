import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentStatus, UserRole } from '@prisma/client';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { hasPermissionAtClinic } from '../auth/clinic-roles';
import { REQUIRE_PERMISSION_KEY } from '../auth/decorators/require-permission.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ReminderService } from '../reminders/reminder.service';
import { EmailDeliverabilityService } from '../common/email-policy';
import { ClinicAppointmentsController } from './clinic-appointments.controller';
import { ClinicAppointmentRequestsController } from './clinic-appointment-requests.controller';
import { PatientApiController } from './patient-api.controller';
import { PatientPortalService } from './patient-portal.service';
import {
  APPOINTMENT_ROUTES,
  APPOINTMENT_TRANSITIONS,
  roleHoldsAppointmentPermission,
  type AppointmentRoute,
} from '../testing/appointment-lifecycle';
import {
  CLINIC_A1,
  CLINIC_B1,
  CROSS_CLINIC_MANAGER_VOLUNTEER,
  OUTSIDER,
  PORTAL_PATIENT,
  SYSTEM_ADMIN,
  buildRequest,
  createExecutionContext,
  inClinic,
  type TestActor,
} from '../testing/rbac-harness';
import {
  FIXTURE_ACTOR_ID,
  FIXTURE_APPOINTMENT_ID,
  FIXTURE_CLINIC_ID,
  FIXTURE_OTHER_CLINIC_ID,
  FIXTURE_PATIENT_ID,
  appointmentFixture,
  createAppointmentCollaboratorMocks,
  createAppointmentPrismaMock,
  portalPatientFixture,
  type AppointmentCollaboratorMocks,
  type AppointmentPrismaMock,
} from '../testing/appointment-fixtures';

/**
 * Who may reach the appointment workflow, decided by the guards that actually run.
 *
 * Asserting on `@RequirePermission` metadata proves a decorator is present; it does not prove the
 * guard chain reaches the same decision. Every case here builds a request and an `ExecutionContext`
 * that `ClinicScopeGuard` and `RbacGuard` evaluate for real, so a failure means a real caller would
 * have been allowed or denied, not merely that an annotation moved.
 */

type ControllerKind = AppointmentRoute['controller'];

/** Every identity the matrix reports on, including the ones that must be refused. */
const ACTORS: ReadonlyArray<{ label: string; actor: TestActor; role: UserRole }> = [
  { label: 'system admin', actor: SYSTEM_ADMIN, role: UserRole.SYSTEM_ADMIN },
  { label: 'director', actor: inClinic(UserRole.DIRECTOR), role: UserRole.DIRECTOR },
  { label: 'manager', actor: inClinic(UserRole.MANAGER), role: UserRole.MANAGER },
  { label: 'doctor', actor: inClinic(UserRole.DOCTOR), role: UserRole.DOCTOR },
  { label: 'volunteer', actor: inClinic(UserRole.VOLUNTEER), role: UserRole.VOLUNTEER },
  { label: 'portal patient', actor: PORTAL_PATIENT, role: UserRole.PATIENT },
];

describe('appointment access', () => {
  let controllers: Record<ControllerKind, object>;
  let reflector: Reflector;
  let clinicScopeGuard: ClinicScopeGuard;
  let rbacGuard: RbacGuard;
  let service: PatientPortalService;
  let prisma: AppointmentPrismaMock;
  let collaborators: AppointmentCollaboratorMocks;

  beforeEach(async () => {
    prisma = createAppointmentPrismaMock();
    collaborators = createAppointmentCollaboratorMocks();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      keycloakSub: 'kc-sub-1',
      isActive: true,
    });
    prisma.patientAccountLink.findFirst.mockResolvedValue({ patient: portalPatientFixture });
    prisma.appointment.findFirst.mockResolvedValue(null);
    prisma.appointment.findMany.mockResolvedValue([]);
    prisma.appointmentRequest.findMany.mockResolvedValue([]);
    prisma.clinic.findUnique.mockResolvedValue({ name: 'Clinic One' });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [
        ClinicAppointmentsController,
        ClinicAppointmentRequestsController,
        PatientApiController,
      ],
      providers: [
        Reflector,
        ClinicScopeGuard,
        RbacGuard,
        PatientPortalService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: collaborators.auditService },
        { provide: ReminderService, useValue: collaborators.reminderService },
        {
          provide: EmailDeliverabilityService,
          useValue: collaborators.emailDeliverabilityService,
        },
      ],
    }).compile();

    controllers = {
      'staff-appointments': module.get(ClinicAppointmentsController),
      'staff-appointment-requests': module.get(ClinicAppointmentRequestsController),
      patient: module.get(PatientApiController),
    };
    reflector = module.get(Reflector);
    clinicScopeGuard = module.get(ClinicScopeGuard);
    rbacGuard = module.get(RbacGuard);
    service = module.get(PatientPortalService);
  });

  /** Build the request shape a route's clinic-scope source actually reads. */
  function requestFor(route: AppointmentRoute, actor: TestActor, clinicId: string = CLINIC_A1) {
    return route.clinicScope === 'param'
      ? buildRequest(actor, { params: { clinicId }, query: {}, headers: {} })
      : buildRequest(actor, { params: {}, query: {}, headers: { 'x-clinic-id': clinicId } });
  }

  function decide(route: AppointmentRoute, actor: TestActor, clinicId: string = CLINIC_A1) {
    const request = requestFor(route, actor, clinicId);
    const controller = controllers[route.controller];
    const context = createExecutionContext(
      controller,
      route.handler as keyof typeof controller,
      request,
    );
    clinicScopeGuard.canActivate(context);
    return rbacGuard.canActivate(context);
  }

  describe.each(APPOINTMENT_ROUTES.map((route) => [`${route.method} ${route.path}`, route]))(
    '%s',
    (_label, route) => {
      it('declares the permission the lifecycle table names', () => {
        const controller = controllers[route.controller];
        const handler = controller[route.handler as keyof typeof controller];
        const declared = reflector.get<string>(
          REQUIRE_PERMISSION_KEY,
          handler as unknown as () => unknown,
        );

        expect(declared).toBe(route.permission);
      });

      it.each(ACTORS.map((entry) => [entry.label, entry.actor, entry.role]))(
        'decides %s the way the permission table says',
        (_actorLabel, actor, role) => {
          const expected = roleHoldsAppointmentPermission(role, route.permission);

          if (expected) {
            expect(decide(route, actor)).toBe(true);
          } else {
            expect(() => decide(route, actor)).toThrow(ForbiddenException);
          }
        },
      );

      it('refuses a caller holding no seat at this clinic', () => {
        // A doctor at another organization entirely. Clinic scope must stop this before RBAC.
        expect(() => decide(route, OUTSIDER)).toThrow(ForbiddenException);
      });

      it('refuses a request that names no clinic at all', () => {
        const controller = controllers[route.controller];
        const context = createExecutionContext(
          controller,
          route.handler as keyof typeof controller,
          buildRequest(inClinic(UserRole.MANAGER), { params: {}, query: {}, headers: {} }),
        );

        expect(() => clinicScopeGuard.canActivate(context)).toThrow(ForbiddenException);
      });
    },
  );

  describe('the staff boundary', () => {
    const staffRoutes = APPOINTMENT_ROUTES.filter((route) => route.controller !== 'patient');
    const patientRoutes = APPOINTMENT_ROUTES.filter((route) => route.controller === 'patient');

    it.each(staffRoutes.map((route) => [`${route.method} ${route.path}`, route]))(
      'keeps a portal patient out of %s',
      (_label, route) => {
        expect(() => decide(route, PORTAL_PATIENT)).toThrow(ForbiddenException);
      },
    );

    it.each(patientRoutes.map((route) => [`${route.method} ${route.path}`, route]))(
      'keeps clinic staff out of %s',
      (_label, route) => {
        // The portal routes answer for whoever is calling. A staff seat must not reach them,
        // because there is no patient behind a clinical role to answer for.
        for (const role of [
          UserRole.DIRECTOR,
          UserRole.MANAGER,
          UserRole.DOCTOR,
          UserRole.VOLUNTEER,
        ]) {
          expect(() => decide(route, inClinic(role))).toThrow(ForbiddenException);
        }
      },
    );

    it('lets every role that can action a request also list them', () => {
      // A volunteer once held SCREENING.WRITE without SCREENING.READ and could not see what they
      // recorded. The same shape here would let a doctor confirm a request they cannot open.
      const list = APPOINTMENT_ROUTES.find((route) => route.id === 'staff-list-requests')!;
      const confirm = APPOINTMENT_ROUTES.find((route) => route.id === 'staff-confirm-request')!;

      for (const role of [
        UserRole.DIRECTOR,
        UserRole.MANAGER,
        UserRole.DOCTOR,
        UserRole.VOLUNTEER,
      ]) {
        if (roleHoldsAppointmentPermission(role, confirm.permission)) {
          expect(roleHoldsAppointmentPermission(role, list.permission)).toBe(true);
        }
      }
    });

    it('lets every role that can move an appointment also read the schedule', () => {
      const read = APPOINTMENT_ROUTES.find((route) => route.id === 'staff-list-appointments')!;

      for (const transition of APPOINTMENT_TRANSITIONS) {
        for (const role of [UserRole.MANAGER, UserRole.DOCTOR, UserRole.VOLUNTEER]) {
          if (roleHoldsAppointmentPermission(role, transition.permission)) {
            expect(roleHoldsAppointmentPermission(role, read.permission)).toBe(true);
          }
        }
      }
    });

    it('gives a volunteer the schedule without the ability to change it', () => {
      const read = APPOINTMENT_ROUTES.find((route) => route.id === 'staff-list-appointments')!;
      expect(roleHoldsAppointmentPermission(UserRole.VOLUNTEER, read.permission)).toBe(true);
      for (const transition of APPOINTMENT_TRANSITIONS) {
        expect(roleHoldsAppointmentPermission(UserRole.VOLUNTEER, transition.permission)).toBe(
          false,
        );
      }
    });

    it('gives a director the schedule without the ability to change it', () => {
      const read = APPOINTMENT_ROUTES.find((route) => route.id === 'staff-list-appointments')!;
      expect(roleHoldsAppointmentPermission(UserRole.DIRECTOR, read.permission)).toBe(true);
      for (const transition of APPOINTMENT_TRANSITIONS) {
        expect(roleHoldsAppointmentPermission(UserRole.DIRECTOR, transition.permission)).toBe(
          false,
        );
      }
    });
  });

  describe('a seat at one clinic never authorizes another', () => {
    const staffRoutes = APPOINTMENT_ROUTES.filter((route) => route.controller !== 'patient');

    it.each(staffRoutes.map((route) => [`${route.method} ${route.path}`, route]))(
      'decides %s from the seat held at the clinic being reached',
      (_label, route) => {
        // Manager at A1, volunteer at B1. Both seats admit the user to their own clinic; each must
        // decide only its own. Reading the whole role array would grant manager writes at B1.
        const grantedAtA1 = hasPermissionAtClinic(
          CROSS_CLINIC_MANAGER_VOLUNTEER.roles,
          CLINIC_A1,
          route.permission,
        );
        const grantedAtB1 = hasPermissionAtClinic(
          CROSS_CLINIC_MANAGER_VOLUNTEER.roles,
          CLINIC_B1,
          route.permission,
        );

        expect(grantedAtA1).toBe(
          roleHoldsAppointmentPermission(UserRole.MANAGER, route.permission),
        );
        expect(grantedAtB1).toBe(
          roleHoldsAppointmentPermission(UserRole.VOLUNTEER, route.permission),
        );

        if (grantedAtA1) {
          expect(decide(route, CROSS_CLINIC_MANAGER_VOLUNTEER, CLINIC_A1)).toBe(true);
        } else {
          expect(() => decide(route, CROSS_CLINIC_MANAGER_VOLUNTEER, CLINIC_A1)).toThrow(
            ForbiddenException,
          );
        }
        if (grantedAtB1) {
          expect(decide(route, CROSS_CLINIC_MANAGER_VOLUNTEER, CLINIC_B1)).toBe(true);
        } else {
          expect(() => decide(route, CROSS_CLINIC_MANAGER_VOLUNTEER, CLINIC_B1)).toThrow(
            ForbiddenException,
          );
        }
      },
    );
  });

  describe('patient ownership', () => {
    it('resolves the caller through their own portal link, scoped to the clinic', async () => {
      await service.listAppointmentsForAuthenticatedPatient(FIXTURE_CLINIC_ID, 'user-1', {});

      expect(prisma.patientAccountLink.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            patient: expect.objectContaining({ primaryClinicId: FIXTURE_CLINIC_ID }),
          }),
        }),
      );
      expect(prisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            clinicId: FIXTURE_CLINIC_ID,
            patientId: FIXTURE_PATIENT_ID,
          }),
        }),
      );
    });

    it('refuses an appointment id that belongs to another patient', async () => {
      // The row exists, but not under this patient, so the ownership-scoped lookup finds nothing.
      prisma.appointment.findFirst.mockResolvedValue(null);

      await expect(
        service.createCancelAppointmentRequestForAuthenticatedPatient(
          FIXTURE_CLINIC_ID,
          'user-1',
          'someone-elses-appointment',
          { reason: 'Not mine' },
          'req-1',
        ),
      ).rejects.toThrow('Appointment not found');

      expect(prisma.appointment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'someone-elses-appointment',
            clinicId: FIXTURE_CLINIC_ID,
            patientId: FIXTURE_PATIENT_ID,
          }),
        }),
      );
      expect(prisma.appointmentRequest.create).not.toHaveBeenCalled();
    });

    it('refuses a request naming a clinic other than the one in scope', async () => {
      await expect(
        service.createAppointmentRequestForAuthenticatedPatient(
          FIXTURE_CLINIC_ID,
          'user-1',
          {
            clinicId: FIXTURE_OTHER_CLINIC_ID,
            preferredStartDate: '2099-04-01',
            preferredEndDate: '2099-04-05',
          },
          'req-1',
        ),
      ).rejects.toThrow('clinicId must match the active clinic context');
      expect(prisma.appointmentRequest.create).not.toHaveBeenCalled();
    });

    it('refuses a patient reaching a clinic that is not their primary one', async () => {
      prisma.patientAccountLink.findFirst.mockResolvedValue(null);

      await expect(
        service.createAppointmentRequestForAuthenticatedPatient(
          FIXTURE_OTHER_CLINIC_ID,
          'user-1',
          { preferredStartDate: '2099-04-01', preferredEndDate: '2099-04-05' },
          'req-1',
        ),
      ).rejects.toBeDefined();
      expect(prisma.appointmentRequest.create).not.toHaveBeenCalled();
    });
  });

  describe('clinic isolation in the queries themselves', () => {
    it('scopes the staff schedule read to the calling clinic', async () => {
      await service.listAppointmentsForClinic(FIXTURE_CLINIC_ID, {
        from: '2026-03-01',
        to: '2026-03-31',
      });

      expect(prisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ clinicId: FIXTURE_CLINIC_ID }),
        }),
      );
    });

    it('scopes the staff request read to the calling clinic', async () => {
      await service.listAppointmentRequestsForClinic(FIXTURE_CLINIC_ID, {});

      expect(prisma.appointmentRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ clinicId: FIXTURE_CLINIC_ID }),
        }),
      );
    });

    it('will not confirm a request that belongs to another clinic', async () => {
      prisma.appointmentRequest.findFirst.mockResolvedValue(null);

      await expect(
        service.confirmAppointmentRequest(
          FIXTURE_OTHER_CLINIC_ID,
          'request-from-clinic-1',
          FIXTURE_ACTOR_ID,
          { startsAt: '2099-04-02T10:00:00.000Z', endsAt: '2099-04-02T10:30:00.000Z' },
          'req-1',
        ),
      ).rejects.toThrow('Appointment request not found');
      expect(prisma.appointment.create).not.toHaveBeenCalled();
    });

    it('will not move an appointment that belongs to another clinic', async () => {
      // The appointment exists at clinic-1; the caller was admitted to clinic-2.
      prisma.appointment.findFirst.mockImplementation(async ({ where }) =>
        where.clinicId === FIXTURE_CLINIC_ID
          ? appointmentFixture({ status: AppointmentStatus.CONFIRMED })
          : null,
      );

      await expect(
        service.cancelAppointment(
          FIXTURE_OTHER_CLINIC_ID,
          FIXTURE_APPOINTMENT_ID,
          FIXTURE_ACTOR_ID,
          { reason: 'Wrong clinic' },
          'req-1',
        ),
      ).rejects.toThrow('Appointment not found');
      expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
      expect(collaborators.auditService.logWrite).not.toHaveBeenCalled();
    });

    it('only offers assignable staff seated at the calling clinic', async () => {
      prisma.userClinicRole.findMany.mockResolvedValue([]);

      await service.listAppointmentStaffOptionsForClinic(FIXTURE_CLINIC_ID);

      expect(prisma.userClinicRole.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ clinicId: FIXTURE_CLINIC_ID }),
        }),
      );
    });
  });
});
