import {
  Controller,
  Post,
  Body,
  Param,
  Request,
  UseGuards,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { ConsentType } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { ClinicScoped } from "../auth/decorators/clinic-scoped.decorator";
import { RbacGuard } from "../auth/guards/rbac.guard";
import { ClinicScopeGuard } from "../auth/guards/clinic-scope.guard";
import { ConsentService } from "./consent.service";
import { CreateConsentDto } from "./dto/create-consent.dto";
import { PERMISSIONS } from "../auth/constants/permissions";

@Controller("clinics/:clinicId/patients/:patientId/consents")
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class ConsentsController {
  constructor(private readonly consentService: ConsentService) {}

  @Post()
  @ClinicScoped({ type: "param", paramKey: "clinicId" })
  @RequirePermission(PERMISSIONS.CONSENT_RECORD)
  async grant(
    @Param("clinicId") clinicId: string,
    @Param("patientId") patientId: string,
    @Body() body: CreateConsentDto,
    @Request() req: { user: { user: { id: string } }; ip?: string; headers?: { "user-agent"?: string } }
  ) {
    const actorUserId = req.user.user.id;
    return this.consentService.grant(clinicId, patientId, body, {
      actorUserId,
      requestId: randomUUID(),
      ipAddress: req.ip ?? null,
      userAgent: req.headers?.["user-agent"] ?? null,
    });
  }

  @Post("revoke")
  @ClinicScoped({ type: "param", paramKey: "clinicId" })
  @RequirePermission(PERMISSIONS.CONSENT_RECORD)
  async revoke(
    @Param("clinicId") clinicId: string,
    @Param("patientId") patientId: string,
    @Body() body: { consentType?: ConsentType },
    @Request() req: { user: { user: { id: string } }; ip?: string; headers?: { "user-agent"?: string } }
  ) {
    const actorUserId = req.user.user.id;
    const consentType = (body?.consentType ?? "RESEARCH_DEIDENTIFIED") as ConsentType;
    return this.consentService.revoke(clinicId, patientId, consentType, {
      actorUserId,
      requestId: randomUUID(),
      ipAddress: req.ip ?? null,
      userAgent: req.headers?.["user-agent"] ?? null,
    });
  }
}
