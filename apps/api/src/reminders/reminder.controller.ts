import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { ClinicScoped } from "../auth/decorators/clinic-scoped.decorator";
import { ClinicScopeGuard } from "../auth/guards/clinic-scope.guard";
import { RbacGuard } from "../auth/guards/rbac.guard";
import { ReminderService } from "./reminder.service";
import { PERMISSIONS } from "../auth/constants/permissions";
import { ReminderStatus } from "@prisma/client";

@Controller("clinics/:clinicId/reminders")
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class RemindersController {
  constructor(private readonly reminderService: ReminderService) {}

  @Get()
  @ClinicScoped({ type: "param", paramKey: "clinicId" })
  @RequirePermission(PERMISSIONS.REMINDER_READ)
  async list(
    @Param("clinicId") clinicId: string,
    @Query("status") status?: ReminderStatus,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string
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
