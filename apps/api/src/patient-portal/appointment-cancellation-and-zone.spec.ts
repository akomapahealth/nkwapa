import { Test, TestingModule } from '@nestjs/testing';
import { PatientPortalService } from './patient-portal.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ReminderService } from '../reminders/reminder.service';
import { EmailDeliverabilityService } from '../common/email-policy';
import { keycloakAdminServiceProvider } from '../testing/keycloak-admin-fixtures';
import {
  FIXTURE_ACTOR_ID,
  FIXTURE_APPOINTMENT_ID,
  FIXTURE_CLINIC_ID,
  appointmentFixture,
  appointmentRequestFixture,
  createAppointmentCollaboratorMocks,
  createAppointmentPrismaMock,
  type AppointmentPrismaMock,
} from '../testing/appointment-fixtures';

/** Who cancelled and when (#307, B1), and appointment times in the clinic's zone (B4). */
describe('appointment cancellation details and clinic time zone (#307)', () => {
  let service: PatientPortalService;
  let prisma: AppointmentPrismaMock;

  beforeEach(async () => {
    prisma = createAppointmentPrismaMock();
    const collaborators = createAppointmentCollaboratorMocks();
    prisma.clinic.findUnique.mockResolvedValue({ name: 'Lagos Clinic', timezone: 'Africa/Lagos' });
    prisma.appointment.updateMany.mockResolvedValue({ count: 1 });
    prisma.appointment.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatientPortalService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: collaborators.auditService },
        { provide: ReminderService, useValue: collaborators.reminderService },
        { provide: EmailDeliverabilityService, useValue: collaborators.emailDeliverabilityService },
        keycloakAdminServiceProvider(),
      ],
    }).compile();
    service = module.get(PatientPortalService);
  });

  describe('cancel (B1)', () => {
    it('records who cancelled, when and why, and returns them on the schedule row', async () => {
      const cancelledAt = new Date('2026-11-05T10:15:00.000Z');
      prisma.appointment.findFirst
        .mockResolvedValueOnce(appointmentFixture())
        .mockResolvedValueOnce(
          appointmentFixture({
            status: 'CANCELLED',
            cancelledAt,
            cancelReason: 'Clinic closed for the holiday',
            cancelledBy: { id: FIXTURE_ACTOR_ID, displayName: 'Esi Front Desk' },
          }),
        );

      const result = await service.cancelAppointment(
        FIXTURE_CLINIC_ID,
        FIXTURE_APPOINTMENT_ID,
        FIXTURE_ACTOR_ID,
        { reason: '  Clinic closed for the holiday  ' },
        'req-1',
      );

      expect(prisma.appointment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            status: 'CANCELLED',
            cancelledAt: expect.any(Date),
            cancelledByUserId: FIXTURE_ACTOR_ID,
            cancelReason: 'Clinic closed for the holiday',
          },
        }),
      );
      expect(result.cancellation).toEqual({
        at: cancelledAt.toISOString(),
        reason: 'Clinic closed for the holiday',
        by: { id: FIXTURE_ACTOR_ID, displayName: 'Esi Front Desk' },
      });
    });

    it('has no cancellation details on a visit that is not cancelled', async () => {
      prisma.appointment.findMany.mockResolvedValue([appointmentFixture({ reminders: [] })]);
      const schedule = await service.listAppointmentsForClinic(FIXTURE_CLINIC_ID, {
        from: '2026-03-26',
        to: '2026-03-26',
      });
      expect(schedule.items[0].cancellation).toBeNull();
    });

    it('says cancelled with no who or when for a visit the backfill could not answer', async () => {
      prisma.appointment.findMany.mockResolvedValue([
        appointmentFixture({ status: 'CANCELLED', cancelledAt: null, reminders: [] }),
      ]);
      const schedule = await service.listAppointmentsForClinic(FIXTURE_CLINIC_ID, {
        from: '2026-03-26',
        to: '2026-03-26',
      });
      expect(schedule.items[0]).toMatchObject({ status: 'CANCELLED', cancellation: null });
    });
  });

  describe('clinic time zone (B4)', () => {
    it("reports the clinic's own zone on the schedule", async () => {
      const schedule = await service.listAppointmentsForClinic(FIXTURE_CLINIC_ID, {
        from: '2026-03-26',
        to: '2026-03-26',
      });
      expect(schedule.timezone).toBe('Africa/Lagos');
    });

    it('reads a time without an offset in the clinic zone, not the server zone', async () => {
      prisma.appointment.findFirst
        .mockResolvedValueOnce(appointmentFixture())
        .mockResolvedValueOnce(appointmentFixture());
      await service.rescheduleAppointment(
        FIXTURE_CLINIC_ID,
        FIXTURE_APPOINTMENT_ID,
        FIXTURE_ACTOR_ID,
        { startsAt: '2099-04-02T09:30', endsAt: '2099-04-02T10:00' },
        'req-2',
      );
      expect(prisma.appointment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            startsAt: new Date('2099-04-02T08:30:00.000Z'),
            endsAt: new Date('2099-04-02T09:00:00.000Z'),
          }),
        }),
      );
    });

    it('keeps an explicit instant exactly as sent', async () => {
      prisma.appointment.findFirst
        .mockResolvedValueOnce(appointmentFixture())
        .mockResolvedValueOnce(appointmentFixture());
      await service.rescheduleAppointment(
        FIXTURE_CLINIC_ID,
        FIXTURE_APPOINTMENT_ID,
        FIXTURE_ACTOR_ID,
        { startsAt: '2099-04-02T09:30:00.000Z', endsAt: '2099-04-02T10:00:00.000Z' },
        'req-3',
      );
      expect(prisma.appointment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ startsAt: new Date('2099-04-02T09:30:00.000Z') }),
        }),
      );
    });

    it('confirms a request in the clinic zone too', async () => {
      prisma.appointmentRequest.findFirst.mockResolvedValue(
        appointmentRequestFixture({ appointment: null }),
      );
      prisma.appointment.create.mockResolvedValue(appointmentFixture());
      prisma.appointmentRequest.update.mockResolvedValue(appointmentRequestFixture());
      await service
        .confirmAppointmentRequest(
          FIXTURE_CLINIC_ID,
          'request-1',
          FIXTURE_ACTOR_ID,
          { startsAt: '2099-04-02T00:30', endsAt: '2099-04-02T01:00' },
          'req-4',
        )
        .catch(() => undefined);
      expect(prisma.appointment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ startsAt: new Date('2099-04-01T23:30:00.000Z') }),
        }),
      );
    });

    it('refuses a wall-clock time that is not a real date', async () => {
      prisma.appointment.findFirst.mockResolvedValue(appointmentFixture());
      await expect(
        service.rescheduleAppointment(
          FIXTURE_CLINIC_ID,
          FIXTURE_APPOINTMENT_ID,
          FIXTURE_ACTOR_ID,
          { startsAt: '2099-02-30T09:30', endsAt: '2099-02-30T10:00' },
          'req-5',
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
    });
  });
});
