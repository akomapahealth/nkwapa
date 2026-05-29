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
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { EncounterService } from './encounter.service';
import { hasPermission, PERMISSIONS } from '../auth/constants/permissions';

type EncounterRequest = {
  user: {
    user: { id: string };
    roles: { clinicId: string | null; role: string }[];
  };
};

@Controller('encounters')
@UseGuards(JwtAuthGuard, RbacGuard)
export class EncountersByIdController {
  constructor(private readonly encounterService: EncounterService) {}

  private async ensureClinicAccess(
    encounterId: string,
    roles: { clinicId: string | null; role: string }[],
    requiredPermission: string,
  ): Promise<string> {
    const encounter = await this.encounterService.findById(encounterId);
    if (!encounter) throw new NotFoundException('Encounter not found');
    const clinicId = encounter.clinicId;
    const clinicRoles = roles.filter(
      (r) => r.clinicId === clinicId || (r.clinicId === null && r.role === UserRole.SYSTEM_ADMIN),
    );
    const hasAccess = clinicRoles.length > 0;
    const hasClinicPermission = hasPermission(
      clinicRoles
        .filter((r): r is { clinicId: string | null; role: UserRole } =>
          Object.values(UserRole).includes(r.role as UserRole),
        )
        .map((r) => ({ role: r.role })),
      requiredPermission,
    );

    if (!hasAccess || !hasClinicPermission) {
      throw new ForbiddenException('Access denied to encounter');
    }

    return clinicId;
  }

  @Get(':encounterId')
  @RequirePermission(PERMISSIONS.ENCOUNTER_READ)
  async findOne(@Param('encounterId') encounterId: string, @Request() req: EncounterRequest) {
    await this.ensureClinicAccess(encounterId, req.user.roles, PERMISSIONS.ENCOUNTER_READ);
    const encounter = await this.encounterService.findById(encounterId, true);
    if (!encounter) throw new NotFoundException('Encounter not found');
    return encounter;
  }

  @Post(':encounterId/submit')
  @RequirePermission(PERMISSIONS.ENCOUNTER_SUBMIT_FOR_REVIEW)
  async submit(@Param('encounterId') encounterId: string, @Request() req: EncounterRequest) {
    const clinicId = await this.ensureClinicAccess(
      encounterId,
      req.user.roles,
      PERMISSIONS.ENCOUNTER_SUBMIT_FOR_REVIEW,
    );
    try {
      return await this.encounterService.submitForReview(encounterId, {
        clinicId,
        actorUserId: req.user.user.id,
        requestId: randomUUID(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Cannot submit')) {
        throw new BadRequestException(msg);
      }
      throw err;
    }
  }

  @Post(':encounterId/review')
  @RequirePermission(PERMISSIONS.ENCOUNTER_REVIEW)
  async review(@Param('encounterId') encounterId: string, @Request() req: EncounterRequest) {
    const clinicId = await this.ensureClinicAccess(
      encounterId,
      req.user.roles,
      PERMISSIONS.ENCOUNTER_REVIEW,
    );
    try {
      return await this.encounterService.reviewEncounter(encounterId, req.user.user.id, {
        clinicId,
        actorUserId: req.user.user.id,
        requestId: randomUUID(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Cannot review') || msg.includes('already reviewed')) {
        throw new BadRequestException(msg);
      }
      throw err;
    }
  }

  @Post(':encounterId/preceptor-review')
  @RequirePermission(PERMISSIONS.ENCOUNTER_REVIEW)
  async legacyPreceptorReview(
    @Param('encounterId') encounterId: string,
    @Request() req: EncounterRequest,
  ) {
    return this.review(encounterId, req);
  }

  @Post(':encounterId/finalize')
  @RequirePermission(PERMISSIONS.DOCTOR_FINALIZE)
  async finalize(@Param('encounterId') encounterId: string, @Request() req: EncounterRequest) {
    const clinicId = await this.ensureClinicAccess(
      encounterId,
      req.user.roles,
      PERMISSIONS.DOCTOR_FINALIZE,
    );
    try {
      return await this.encounterService.finalize(encounterId, req.user.user.id, {
        clinicId,
        actorUserId: req.user.user.id,
        requestId: randomUUID(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Cannot finalize') || msg.includes('must be reviewed')) {
        throw new BadRequestException(msg);
      }
      throw err;
    }
  }
}
