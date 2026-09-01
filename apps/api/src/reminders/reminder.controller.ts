import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { ClinicScoped } from '../auth/decorators/clinic-scoped.decorator';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { ReminderService } from './reminder.service';
import { EmailStatusService } from '../notifications/email/email-status.service';
import { PERMISSIONS } from '../auth/constants/permissions';
import { ReminderStatus } from '@prisma/client';

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

  @Get()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.REMINDER_READ)
  async list(
    @Param('clinicId') clinicId: string,
    @Query('status') status?: ReminderStatus,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reminderService.list({
      clinicId,
      status,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      cursor,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }
}
