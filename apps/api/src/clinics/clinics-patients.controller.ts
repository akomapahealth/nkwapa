import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { ClinicScoped } from "../auth/decorators/clinic-scoped.decorator";
import { RbacGuard } from "../auth/guards/rbac.guard";
import { ClinicScopeGuard } from "../auth/guards/clinic-scope.guard";
import { PatientService } from "../patients/patient.service";
import { CreatePatientBodyDto } from "../patients/dto/create-patient-body.dto";
import { UpdatePatientBodyDto } from "../patients/dto/update-patient-body.dto";
import { PERMISSIONS } from "../auth/constants/permissions";

@Controller("clinics/:clinicId/patients")
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class ClinicsPatientsController {
  constructor(private readonly patientService: PatientService) {}

  @Post()
  @ClinicScoped({ type: "param", paramKey: "clinicId" })
  @RequirePermission(PERMISSIONS.PATIENT_CREATE)
  async create(
    @Param("clinicId") clinicId: string,
    @Body() body: CreatePatientBodyDto,
    @Request() req: { user: { user: { id: string }; roles: unknown[] } }
  ) {
    const dto = {
      ...body,
      primaryClinicId: clinicId,
      dob: body.dob ? new Date(body.dob) : undefined,
      createdByUserId: req.user.user.id,
    };
    return this.patientService.create(dto, {
      clinicId,
      actorUserId: req.user.user.id,
      requestId: randomUUID(),
    });
  }

  @Patch(":patientId")
  @ClinicScoped({ type: "param", paramKey: "clinicId" })
  @RequirePermission(PERMISSIONS.PATIENT_UPDATE)
  async update(
    @Param("clinicId") clinicId: string,
    @Param("patientId") patientId: string,
    @Body() body: UpdatePatientBodyDto,
    @Request() req: { user: { user: { id: string }; roles: unknown[] } }
  ) {
    const existing = await this.patientService.findById(patientId);
    if (!existing) throw new NotFoundException("Patient not found");
    if (existing.primaryClinicId !== clinicId) {
      throw new ForbiddenException("Patient does not belong to this clinic");
    }
    return this.patientService.update(patientId, body, {
      clinicId,
      actorUserId: req.user.user.id,
      requestId: randomUUID(),
    });
  }

  @Get("search")
  @ClinicScoped({ type: "param", paramKey: "clinicId" })
  @RequirePermission(PERMISSIONS.PATIENT_SEARCH)
  async search(
    @Param("clinicId") clinicId: string,
    @Query("q") q: string,
    @Query("take") take?: string
  ) {
    const takeNum = take ? parseInt(take, 10) : 50;
    return this.patientService.search(clinicId, q ?? "", Math.min(takeNum, 100));
  }
}
