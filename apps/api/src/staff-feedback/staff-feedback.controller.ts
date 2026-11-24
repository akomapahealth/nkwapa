import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { ClinicScoped } from '../auth/decorators/clinic-scoped.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../auth/constants/permissions';
import { ClinicIdParamDto } from '../common/request-dto';
import { StaffFeedbackService } from './staff-feedback.service';

/** Directors read their clinic's problem reports (#422). Reports are sent through sync. */
@Controller('clinics/:clinicId/staff-feedback')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class StaffFeedbackController {
  constructor(private readonly staffFeedback: StaffFeedbackService) {}

  @Get()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.FEEDBACK_READ)
  list(@Param() params: ClinicIdParamDto) {
    return this.staffFeedback.list(params.clinicId);
  }
}
