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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { EncounterService } from './encounter.service';
import { PERMISSIONS } from '../auth/constants/permissions';
import { assertPermissionAtClinic, rolesForClinic, type ScopedRole } from '../auth/clinic-roles';

type EncounterRequest = {
  user: {
    user: { id: string };
    roles: ScopedRole[];
  };
};

@Controller('encounters')
@UseGuards(JwtAuthGuard, RbacGuard)
export class EncountersByIdController {
  constructor(private readonly encounterService: EncounterService) {}

  /**
   * Resolve the encounter's clinic and authorize against the roles held there.
   *
   * These routes address an encounter by id alone, so there is no clinic in the path for
   * `@ClinicScoped` to read and `RbacGuard` cannot scope the role list before the handler runs.
   * The clinic is only knowable once the encounter has been loaded, which is why authorization
   * happens here rather than in the guard chain. It goes through the same helper the guards use,
   * so a role held at another clinic is filtered out exactly as it would be on a scoped route.
   */
  private async ensureClinicAccess(
    encounterId: string,
    roles: ScopedRole[],
    requiredPermission: string,
  ): Promise<string> {
    const encounter = await this.encounterService.findById(encounterId);
    if (!encounter) throw new NotFoundException('Encounter not found');
    const clinicId = encounter.clinicId;

    if (rolesForClinic(roles, clinicId).length === 0) {
      throw new ForbiddenException('Access denied to encounter');
    }
    assertPermissionAtClinic(roles, clinicId, requiredPermission, 'Access denied to encounter');

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
