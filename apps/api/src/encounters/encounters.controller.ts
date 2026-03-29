import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { ClinicScoped } from "../auth/decorators/clinic-scoped.decorator";
import { RbacGuard } from "../auth/guards/rbac.guard";
import { ClinicScopeGuard } from "../auth/guards/clinic-scope.guard";
import { EncounterService } from "./encounter.service";
import { PERMISSIONS } from "../auth/constants/permissions";
import type { QueueStage } from "./encounter.repository";

interface CreateEncounterBodyDto {
  patientId: string;
}

@Controller("clinics/:clinicId/encounters")
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class EncountersController {
  constructor(private readonly encounterService: EncounterService) {}

  @Get()
  @ClinicScoped({ type: "param", paramKey: "clinicId" })
  @RequirePermission(PERMISSIONS.ENCOUNTER_READ)
  async list(
    @Param("clinicId") clinicId: string,
    @Query("status") status?: "DRAFT" | "IN_REVIEW" | "FINALIZED",
    @Query("stage") stage?: QueueStage,
    @Query("take") take?: string
  ) {
    if (status === "IN_REVIEW" && stage) {
      return this.encounterService.listByClinic(clinicId, {
        status: "IN_REVIEW",
        stage,
        take: take ? parseInt(take, 10) : 50,
      });
    }
    if (status) {
      return this.encounterService.listByClinic(clinicId, {
        status,
        take: take ? parseInt(take, 10) : 50,
      });
    }
    return this.encounterService.listByClinic(clinicId, {
      take: take ? parseInt(take, 10) : 50,
    });
  }

  @Get(":encounterId")
  @ClinicScoped({ type: "param", paramKey: "clinicId" })
  @RequirePermission(PERMISSIONS.ENCOUNTER_READ)
  async findOne(
    @Param("clinicId") clinicId: string,
    @Param("encounterId") encounterId: string
  ) {
    const encounter = await this.encounterService.findById(encounterId, true);
    if (!encounter || encounter.clinicId !== clinicId) {
      throw new NotFoundException("Encounter not found");
    }
    return encounter;
  }

  @Post(":encounterId/submit")
  @ClinicScoped({ type: "param", paramKey: "clinicId" })
  @RequirePermission(PERMISSIONS.ENCOUNTER_SUBMIT_FOR_REVIEW)
  async submit(
    @Param("clinicId") clinicId: string,
    @Param("encounterId") encounterId: string,
    @Request() req: { user: { user: { id: string } } }
  ) {
    const encounter = await this.encounterService.findById(encounterId);
    if (!encounter || encounter.clinicId !== clinicId) {
      throw new NotFoundException("Encounter not found");
    }
    try {
      return await this.encounterService.submitForReview(encounterId, {
        clinicId,
        actorUserId: req.user.user.id,
        requestId: randomUUID(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Cannot submit")) {
        throw new BadRequestException(msg);
      }
      throw err;
    }
  }

  @Post(":encounterId/preceptor-review")
  @ClinicScoped({ type: "param", paramKey: "clinicId" })
  @RequirePermission(PERMISSIONS.PRECEPTOR_REVIEW)
  async preceptorReview(
    @Param("clinicId") clinicId: string,
    @Param("encounterId") encounterId: string,
    @Request() req: { user: { user: { id: string } } }
  ) {
    const encounter = await this.encounterService.findById(encounterId);
    if (!encounter || encounter.clinicId !== clinicId) {
      throw new NotFoundException("Encounter not found");
    }
    try {
      return await this.encounterService.preceptorReview(
        encounterId,
        req.user.user.id,
        {
          clinicId,
          actorUserId: req.user.user.id,
          requestId: randomUUID(),
        }
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Cannot preceptor") || msg.includes("already preceptor")) {
        throw new BadRequestException(msg);
      }
      throw err;
    }
  }

  @Post(":encounterId/finalize")
  @ClinicScoped({ type: "param", paramKey: "clinicId" })
  @RequirePermission(PERMISSIONS.DOCTOR_FINALIZE)
  async finalize(
    @Param("clinicId") clinicId: string,
    @Param("encounterId") encounterId: string,
    @Request() req: { user: { user: { id: string } } }
  ) {
    const encounter = await this.encounterService.findById(encounterId);
    if (!encounter || encounter.clinicId !== clinicId) {
      throw new NotFoundException("Encounter not found");
    }
    try {
      return await this.encounterService.finalize(
        encounterId,
        req.user.user.id,
        {
          clinicId,
          actorUserId: req.user.user.id,
          requestId: randomUUID(),
        }
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Cannot finalize") || msg.includes("must be preceptor")) {
        throw new BadRequestException(msg);
      }
      throw err;
    }
  }

  @Post()
  @ClinicScoped({ type: "param", paramKey: "clinicId" })
  @RequirePermission(PERMISSIONS.ENCOUNTER_CREATE)
  async create(
    @Param("clinicId") clinicId: string,
    @Body() body: CreateEncounterBodyDto,
    @Request() req: { user: { user: { id: string }; roles: unknown[] } }
  ) {
    const dto = {
      clinicId,
      patientId: body.patientId,
      createdByUserId: req.user.user.id,
    };
    try {
      return await this.encounterService.create(dto, {
        clinicId,
        actorUserId: req.user.user.id,
        requestId: randomUUID(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Clinic not found") || msg.includes("Patient not found")) {
        throw new NotFoundException(msg);
      }
      throw err;
    }
  }
}
