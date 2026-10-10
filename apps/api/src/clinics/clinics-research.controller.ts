import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  Request,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { IsBoolean, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { ClinicScoped } from '../auth/decorators/clinic-scoped.decorator';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { ClinicService } from './clinic.service';
import { AuditService } from '../audit/audit.service';
import { PERMISSIONS } from '../auth/constants/permissions';
import { ClinicIdParamDto } from '../common/request-dto';
import { ToOptionalBoolean } from '../common/validation';

class UpdateResearchSettingsBodyDto {
  @IsOptional()
  @ToOptionalBoolean()
  @IsBoolean()
  researchEnabled?: boolean;

  @IsOptional()
  @ToOptionalBoolean()
  @IsBoolean()
  requiresDirectorApprovalEachExport?: boolean;
}

@Controller('clinics/:clinicId/research')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class ClinicsResearchController {
  constructor(
    private readonly clinicService: ClinicService,
    private readonly auditService: AuditService,
  ) {}

  @Get('settings')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.RESEARCH_SETTINGS_UPDATE)
  async getSettings(@Param() params: ClinicIdParamDto) {
    const clinic = await this.clinicService.findById(params.clinicId);
    if (!clinic) throw new NotFoundException('Clinic not found');
    return this.clinicService.getResearchSettings(params.clinicId);
  }

  @Put('settings')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.RESEARCH_SETTINGS_UPDATE)
  async updateSettings(
    @Param() params: ClinicIdParamDto,
    @Body() body: UpdateResearchSettingsBodyDto,
    @Request() req: { user: { user: { id: string } } },
  ) {
    const clinic = await this.clinicService.findById(params.clinicId);
    if (!clinic) throw new NotFoundException('Clinic not found');
    const dto = {
      researchEnabled: body.researchEnabled ?? false,
      requiresDirectorApprovalEachExport: body.requiresDirectorApprovalEachExport ?? true,
    };
    const updated = await this.clinicService.updateResearchSettings(
      params.clinicId,
      dto,
      req.user.user.id,
    );
    await this.auditService.logWrite({
      clinicId: params.clinicId,
      actorUserId: req.user.user.id,
      action: 'RESEARCH_SETTINGS.UPDATE',
      entityType: 'ClinicResearchSettings',
      entityId: params.clinicId,
      afterJson: JSON.stringify(dto),
    });
    return updated;
  }
}
