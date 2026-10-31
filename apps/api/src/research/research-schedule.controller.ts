import { Body, Controller, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { RbacGuard, type ReqUserWithRoles } from '../auth/guards/rbac.guard';
import { ClinicScoped } from '../auth/decorators/clinic-scoped.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../auth/constants/permissions';
import { ClinicIdParamDto } from '../common/request-dto';
import { ResearchScheduleService } from './research-schedule.service';
import {
  ApproveScheduleDto,
  ClinicAndScheduleParamsDto,
  ResearchReasonDto,
  ResearchScheduleDto,
} from './dto/research-schedule.dto';

type ScheduleRequest = { user: ReqUserWithRoles };

const actor = (clinicId: string, req: ScheduleRequest) => ({
  clinicId,
  userId: req.user.user.id,
});

/**
 * Standing approvals for scheduled research exports (#166). Requesters manage a schedule;
 * approving, rejecting and revoking one is a director's decision, like approving an export.
 */
@Controller('clinics/:clinicId/research/schedules')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class ResearchScheduleController {
  constructor(private readonly schedules: ResearchScheduleService) {}

  @Get()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.RESEARCH_EXPORT_REQUEST)
  list(@Param() params: ClinicIdParamDto) {
    return this.schedules.list(params.clinicId);
  }

  @Post()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.RESEARCH_EXPORT_REQUEST)
  create(
    @Param() params: ClinicIdParamDto,
    @Body() body: ResearchScheduleDto,
    @Request() req: ScheduleRequest,
  ) {
    return this.schedules.create(actor(params.clinicId, req), body);
  }

  @Patch(':scheduleId')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.RESEARCH_EXPORT_REQUEST)
  update(
    @Param() params: ClinicAndScheduleParamsDto,
    @Body() body: ResearchScheduleDto,
    @Request() req: ScheduleRequest,
  ) {
    return this.schedules.update(actor(params.clinicId, req), params.scheduleId, body);
  }

  @Post(':scheduleId/approve')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.RESEARCH_EXPORT_APPROVE)
  approve(
    @Param() params: ClinicAndScheduleParamsDto,
    @Body() body: ApproveScheduleDto,
    @Request() req: ScheduleRequest,
  ) {
    return this.schedules.approve(actor(params.clinicId, req), params.scheduleId, body);
  }

  @Post(':scheduleId/reject')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.RESEARCH_EXPORT_APPROVE)
  reject(
    @Param() params: ClinicAndScheduleParamsDto,
    @Body() body: ResearchReasonDto,
    @Request() req: ScheduleRequest,
  ) {
    return this.schedules.reject(actor(params.clinicId, req), params.scheduleId, body.reason);
  }

  @Post(':scheduleId/pause')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.RESEARCH_EXPORT_REQUEST)
  pause(@Param() params: ClinicAndScheduleParamsDto, @Request() req: ScheduleRequest) {
    return this.schedules.pause(actor(params.clinicId, req), params.scheduleId);
  }

  @Post(':scheduleId/resume')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.RESEARCH_EXPORT_REQUEST)
  resume(@Param() params: ClinicAndScheduleParamsDto, @Request() req: ScheduleRequest) {
    return this.schedules.resume(actor(params.clinicId, req), params.scheduleId);
  }

  @Post(':scheduleId/revoke')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.RESEARCH_EXPORT_APPROVE)
  revoke(
    @Param() params: ClinicAndScheduleParamsDto,
    @Body() body: ResearchReasonDto,
    @Request() req: ScheduleRequest,
  ) {
    return this.schedules.revoke(actor(params.clinicId, req), params.scheduleId, body.reason);
  }

  @Post(':scheduleId/run-now')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.RESEARCH_EXPORT_REQUEST)
  runNow(@Param() params: ClinicAndScheduleParamsDto, @Request() req: ScheduleRequest) {
    return this.schedules.runNow(actor(params.clinicId, req), params.scheduleId);
  }
}
