import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { ClinicScoped } from "../auth/decorators/clinic-scoped.decorator";
import { ClinicScopeGuard } from "../auth/guards/clinic-scope.guard";
import { RbacGuard } from "../auth/guards/rbac.guard";
import { PatientService } from "./patient.service";
import { PERMISSIONS } from "../auth/constants/permissions";

@Controller("patients")
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class PatientsController {
  constructor(private readonly patientService: PatientService) {}

  @RequirePermission(PERMISSIONS.PATIENT_READ)
  @ClinicScoped({ type: "query", queryKey: "clinicId" })
  @Get(":patientId")
  async findOne(
    @Param("patientId") patientId: string,
    @Query("clinicId") clinicId: string
  ) {
    if (!clinicId) {
      throw new BadRequestException("clinicId query parameter is required");
    }
    const result = await this.patientService.findByIdWithRecentEncounters(
      patientId,
      10,
      clinicId
    );
    if (!result) {
      throw new NotFoundException("Patient not found");
    }
    if (result.patient.primaryClinicId !== clinicId) {
      throw new ForbiddenException("Patient does not belong to this clinic");
    }
    return result;
  }
}
