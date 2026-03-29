import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  Request,
  UseGuards,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { ClinicScoped } from "../auth/decorators/clinic-scoped.decorator";
import { RbacGuard } from "../auth/guards/rbac.guard";
import { ClinicScopeGuard } from "../auth/guards/clinic-scope.guard";
import { ClinicService } from "./clinic.service";
import { AuditService } from "../audit/audit.service";
import { PERMISSIONS } from "../auth/constants/permissions";

interface UpdateResearchSettingsBodyDto {
  researchEnabled?: boolean;
  requiresDirectorApprovalEachExport?: boolean;
}

@Controller("clinics/:clinicId/research")
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class ClinicsResearchController {
  constructor(
    private readonly clinicService: ClinicService,
    private readonly auditService: AuditService
  ) {}

  @Get("settings")
  @ClinicScoped({ type: "param", paramKey: "clinicId" })
  @RequirePermission(PERMISSIONS.RESEARCH_SETTINGS_UPDATE)
  async getSettings(@Param("clinicId") clinicId: string) {
    const clinic = await this.clinicService.findById(clinicId);
    if (!clinic) throw new NotFoundException("Clinic not found");
    return this.clinicService.getResearchSettings(clinicId);
  }

  @Put("settings")
  @ClinicScoped({ type: "param", paramKey: "clinicId" })
  @RequirePermission(PERMISSIONS.RESEARCH_SETTINGS_UPDATE)
  async updateSettings(
    @Param("clinicId") clinicId: string,
    @Body() body: UpdateResearchSettingsBodyDto,
    @Request() req: { user: { user: { id: string } } }
  ) {
    const clinic = await this.clinicService.findById(clinicId);
    if (!clinic) throw new NotFoundException("Clinic not found");
    const dto = {
      researchEnabled: body.researchEnabled ?? false,
      requiresDirectorApprovalEachExport:
        body.requiresDirectorApprovalEachExport ?? true,
    };
    const updated = await this.clinicService.updateResearchSettings(
      clinicId,
      dto,
      req.user.user.id
    );
    await this.auditService.logWrite({
      clinicId,
      actorUserId: req.user.user.id,
      action: "RESEARCH_SETTINGS.UPDATE",
      entityType: "ClinicResearchSettings",
      entityId: clinicId,
      afterJson: JSON.stringify(dto),
      requestId: randomUUID(),
    });
    return updated;
  }
}
