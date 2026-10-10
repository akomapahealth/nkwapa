import { Controller, Post, Body, Param, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { ClinicScoped } from '../auth/decorators/clinic-scoped.decorator';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { ConsentService } from './consent.service';
import { CreateConsentDto, RevokeConsentDto } from './dto/create-consent.dto';
import { PERMISSIONS } from '../auth/constants/permissions';
import { ClinicAndPatientParamsDto } from '../common/request-dto';

@Controller('clinics/:clinicId/patients/:patientId/consents')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class ConsentsController {
  constructor(private readonly consentService: ConsentService) {}

  @Post()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.CONSENT_RECORD)
  async grant(
    @Param() params: ClinicAndPatientParamsDto,
    @Body() body: CreateConsentDto,
    @Request()
    req: { user: { user: { id: string } }; ip?: string; headers?: { 'user-agent'?: string } },
  ) {
    const actorUserId = req.user.user.id;
    return this.consentService.grant(params.clinicId, params.patientId, body, {
      actorUserId,
      ipAddress: req.ip ?? null,
      userAgent: req.headers?.['user-agent'] ?? null,
    });
  }

  @Post('revoke')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.CONSENT_RECORD)
  async revoke(
    @Param() params: ClinicAndPatientParamsDto,
    @Body() body: RevokeConsentDto,
    @Request()
    req: { user: { user: { id: string } }; ip?: string; headers?: { 'user-agent'?: string } },
  ) {
    const actorUserId = req.user.user.id;
    const consentType = body?.consentType ?? 'RESEARCH_DEIDENTIFIED';
    return this.consentService.revoke(params.clinicId, params.patientId, consentType, {
      actorUserId,
      ipAddress: req.ip ?? null,
      userAgent: req.headers?.['user-agent'] ?? null,
    });
  }
}
