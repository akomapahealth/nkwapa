import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { RbacGuard, type ReqUserWithRoles } from '../auth/guards/rbac.guard';
import { ClinicScoped } from '../auth/decorators/clinic-scoped.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../auth/constants/permissions';
import { RateLimit } from '../common/rate-limit.decorator';
import { ClinicIdParamDto } from '../common/request-dto';
import { AddPracticePatientsDto } from './practice.dto';
import { PracticeService } from './practice.service';

type PracticeRequest = { user: ReqUserWithRoles; headers?: { 'x-request-id'?: string } };

/**
 * Practice sessions (#410). PATIENT.DEMO.MANAGE (directors, system admins) is the only gate:
 * creating charts here needs no PATIENT.CREATE, because every chart it makes is a demo chart.
 */
@Controller('clinics/:clinicId/practice')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class PracticeController {
  constructor(private readonly practice: PracticeService) {}

  @Get()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.PATIENT_DEMO_MANAGE)
  summary(@Param() params: ClinicIdParamDto) {
    return this.practice.summary(params.clinicId);
  }

  @Post('patients')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.PATIENT_DEMO_MANAGE)
  @RateLimit({ key: 'practice_add', limit: 1, windowSeconds: 5, scope: 'user' })
  add(
    @Param() params: ClinicIdParamDto,
    @Body() body: AddPracticePatientsDto,
    @Request() req: PracticeRequest,
  ) {
    return this.practice.addPatients(params.clinicId, this.actor(req), body);
  }

  @Post('clear')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.PATIENT_DEMO_MANAGE)
  @RateLimit({ key: 'practice_clear', limit: 1, windowSeconds: 5, scope: 'user' })
  clear(@Param() params: ClinicIdParamDto, @Request() req: PracticeRequest) {
    return this.practice.clear(params.clinicId, this.actor(req));
  }

  private actor(req: PracticeRequest) {
    return {
      userId: req.user.user.id,
      requestId: req.headers?.['x-request-id'] ?? randomUUID(),
    };
  }
}
