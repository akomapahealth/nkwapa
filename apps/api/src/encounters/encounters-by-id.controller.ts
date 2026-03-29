import {
  Controller,
  Get,
  Post,
  Param,
  Request,
  UseGuards,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { RbacGuard } from "../auth/guards/rbac.guard";
import { EncounterService } from "./encounter.service";
import { PERMISSIONS } from "../auth/constants/permissions";

@Controller("encounters")
@UseGuards(JwtAuthGuard, RbacGuard)
export class EncountersByIdController {
  constructor(private readonly encounterService: EncounterService) {}

  private async ensureClinicAccess(
    encounterId: string,
    roles: { clinicId: string | null; role: string }[]
  ): Promise<string> {
    const encounter = await this.encounterService.findById(encounterId);
    if (!encounter) throw new NotFoundException("Encounter not found");
    const clinicId = encounter.clinicId;
    const isSystemAdmin = roles.some(
      (r) => r.role === "SYSTEM_ADMIN" && r.clinicId === null
    );
    if (isSystemAdmin) return clinicId;
    const hasAccess = roles.some((r) => r.clinicId === clinicId);
    if (!hasAccess) throw new ForbiddenException("Access denied to encounter");
    return clinicId;
  }

  @Get(":encounterId")
  @RequirePermission(PERMISSIONS.ENCOUNTER_READ)
  async findOne(
    @Param("encounterId") encounterId: string,
    @Request() req: { user: { user: { id: string }; roles: { clinicId: string | null; role: string }[] } }
  ) {
    await this.ensureClinicAccess(encounterId, req.user.roles);
    const encounter = await this.encounterService.findById(encounterId, true);
    if (!encounter) throw new NotFoundException("Encounter not found");
    return encounter;
  }

  @Post(":encounterId/submit")
  @RequirePermission(PERMISSIONS.ENCOUNTER_SUBMIT_FOR_REVIEW)
  async submit(
    @Param("encounterId") encounterId: string,
    @Request() req: { user: { user: { id: string }; roles: { clinicId: string | null; role: string }[] } }
  ) {
    const clinicId = await this.ensureClinicAccess(encounterId, req.user.roles);
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
  @RequirePermission(PERMISSIONS.PRECEPTOR_REVIEW)
  async preceptorReview(
    @Param("encounterId") encounterId: string,
    @Request() req: { user: { user: { id: string }; roles: { clinicId: string | null; role: string }[] } }
  ) {
    const clinicId = await this.ensureClinicAccess(encounterId, req.user.roles);
    try {
      return await this.encounterService.preceptorReview(
        encounterId,
        req.user.user.id,
        { clinicId, actorUserId: req.user.user.id, requestId: randomUUID() }
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
  @RequirePermission(PERMISSIONS.DOCTOR_FINALIZE)
  async finalize(
    @Param("encounterId") encounterId: string,
    @Request() req: { user: { user: { id: string }; roles: { clinicId: string | null; role: string }[] } }
  ) {
    const clinicId = await this.ensureClinicAccess(encounterId, req.user.roles);
    try {
      return await this.encounterService.finalize(
        encounterId,
        req.user.user.id,
        { clinicId, actorUserId: req.user.user.id, requestId: randomUUID() }
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Cannot finalize") || msg.includes("must be preceptor")) {
        throw new BadRequestException(msg);
      }
      throw err;
    }
  }
}
