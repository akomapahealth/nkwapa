import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Request,
  UseGuards,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { ClinicScoped } from "../auth/decorators/clinic-scoped.decorator";
import { RbacGuard } from "../auth/guards/rbac.guard";
import { ClinicScopeGuard } from "../auth/guards/clinic-scope.guard";
import { PERMISSIONS } from "../auth/constants/permissions";
import { PrescriptionService } from "./prescription.service";
import { CreatePrescriptionDto } from "./dto/create-prescription.dto";
import { UpdatePrescriptionDto } from "./dto/update-prescription.dto";

@Controller("clinics/:clinicId/encounters/:encounterId/prescriptions")
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class PrescriptionsController {
  constructor(private readonly prescriptionService: PrescriptionService) {}

  @Post()
  @ClinicScoped({ type: "param", paramKey: "clinicId" })
  @RequirePermission(PERMISSIONS.PRESCRIPTION_WRITE)
  async create(
    @Param("clinicId") clinicId: string,
    @Param("encounterId") encounterId: string,
    @Body() body: CreatePrescriptionDto,
    @Request() req: { user: { user: { id: string } } }
  ) {
    return this.prescriptionService.create(clinicId, encounterId, body, {
      clinicId,
      actorUserId: req.user.user.id,
      requestId: randomUUID(),
    });
  }

  @Get()
  @ClinicScoped({ type: "param", paramKey: "clinicId" })
  @RequirePermission(PERMISSIONS.PRESCRIPTION_READ)
  async listByEncounter(@Param("encounterId") encounterId: string) {
    return this.prescriptionService.listByEncounter(encounterId);
  }

  @Patch(":id")
  @ClinicScoped({ type: "param", paramKey: "clinicId" })
  @RequirePermission(PERMISSIONS.PRESCRIPTION_WRITE)
  async update(
    @Param("clinicId") clinicId: string,
    @Param("id") id: string,
    @Body() body: UpdatePrescriptionDto,
    @Request() req: { user: { user: { id: string } } }
  ) {
    return this.prescriptionService.update(id, body, {
      clinicId,
      actorUserId: req.user.user.id,
      requestId: randomUUID(),
    });
  }

  @Delete(":id")
  @ClinicScoped({ type: "param", paramKey: "clinicId" })
  @RequirePermission(PERMISSIONS.PRESCRIPTION_WRITE)
  async remove(
    @Param("clinicId") clinicId: string,
    @Param("id") id: string,
    @Request() req: { user: { user: { id: string } } }
  ) {
    await this.prescriptionService.remove(id, {
      clinicId,
      actorUserId: req.user.user.id,
      requestId: randomUUID(),
    });
    return { deleted: true };
  }
}
