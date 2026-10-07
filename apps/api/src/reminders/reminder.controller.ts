import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Matches } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { ClinicScoped } from '../auth/decorators/clinic-scoped.decorator';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { RbacGuard, type ReqUserWithRoles } from '../auth/guards/rbac.guard';
import { hasPermissionAtClinic } from '../auth/clinic-roles';
import { ReminderService } from './reminder.service';
import { EmailStatusService } from '../notifications/email/email-status.service';
import { PERMISSIONS } from '../auth/constants/permissions';
import { ReminderStatus } from '@prisma/client';
import { isNotificationTypeGroup } from '../notifications/templates';

@Controller('clinics/:clinicId/reminders')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class RemindersController {
  constructor(
    private readonly reminderService: ReminderService,
    private readonly emailStatus: EmailStatusService,
  ) {}

  /**
   * Whether email can currently be delivered, and what to fix if it cannot.
   *
   * Declared before any future `@Get(':id')` route, which would otherwise capture it.
   * The response carries environment variable names but never their values, so it is
   * safe for any operator who can already read the reminder ledger.
   */
  @Get('email-status')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.REMINDER_READ)
  async emailDeliveryStatus() {
    return this.emailStatus.getStatus();
  }

  /**
   * Cancel a staff-scheduled reminder that has not gone out (#116). Gated on reading the ledger;
   * the service decides whether this caller may cancel this one (its scheduler, or a manager).
   */
  @Post(':reminderId/cancel')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.REMINDER_READ)
  async cancel(
    @Request() req: { user: ReqUserWithRoles; headers?: { 'x-request-id'?: string } },
    @Param('clinicId') clinicId: string,
    @Param('reminderId', ParseUUIDPipe) reminderId: string,
  ) {
    const reminder = await this.reminderService.cancelStaffReminder({
      clinicId,
      reminderId,
      actorUserId: req.user.user.id,
      canCancelAny: hasPermissionAtClinic(
        req.user.roles,
        clinicId,
        PERMISSIONS.REMINDER_CANCEL_ANY,
      ),
      requestId: req.headers?.['x-request-id'] ?? randomUUID(),
    });
    return { id: reminder.id, status: reminder.status, failureReason: reminder.failureReason };
  }

  @Get()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.REMINDER_READ)
  async list(
    @Request() req: { user: ReqUserWithRoles },
    @Param('clinicId') clinicId: string,
    @Query('status') status?: ReminderStatus,
    @Query('channel') channel?: string,
    @Query('type') type?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reminderService.list({
      clinicId,
      patientRemindersOnly: !hasPermissionAtClinic(
        req.user.roles,
        clinicId,
        PERMISSIONS.REMINDER_READ_STAFF_NOTICES,
      ),
      status,
      // Unrecognised values are dropped rather than rejected: a stale bookmark should
      // show the unfiltered ledger, not an error page.
      channel: channel === 'SMS' || channel === 'EMAIL' ? channel : undefined,
      type: type && isNotificationTypeGroup(type) ? type : undefined,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      cursor,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }
}

export class ScheduleFollowUpReminderDto {
  /** The clinic-local date the patient should return. */
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'followUpDate must be YYYY-MM-DD' })
  followUpDate!: string;
}

/**
 * Staff-scheduled patient reminders (#116). The only message is the registered follow-up template;
 * the body carries a date and nothing that could become outbound text.
 */
@Controller('clinics/:clinicId/patients/:patientId/reminders')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class PatientRemindersController {
  constructor(private readonly reminderService: ReminderService) {}

  @Post('follow-up')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.REMINDER_CREATE)
  async scheduleFollowUp(
    @Param('clinicId') clinicId: string,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() body: ScheduleFollowUpReminderDto,
    @Request() req: { user: ReqUserWithRoles; headers?: { 'x-request-id'?: string } },
  ) {
    const items = await this.reminderService.scheduleStaffFollowUp({
      clinicId,
      patientId,
      followUpDate: body.followUpDate,
      actorUserId: req.user.user.id,
      requestId: req.headers?.['x-request-id'] ?? randomUUID(),
    });
    return {
      items: items.map((reminder) => ({
        id: reminder.id,
        channel: reminder.channel,
        status: reminder.status,
        scheduledAt: reminder.scheduledAt,
        failureReason: reminder.failureReason,
      })),
    };
  }
}
