import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Request,
  Res,
  UseGuards,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { EncounterStatus, FollowUpTier, HypertensionClassification } from '@prisma/client';
import { hasPermissionAtClinic } from '../auth/clinic-roles';
import type { ReqUserWithRoles } from '../auth/guards/rbac.guard';
import { isApiFeatureEnabled } from '../common/feature-flags';
import type { Response } from 'express';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { ClinicScoped } from '../auth/decorators/clinic-scoped.decorator';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { EncounterService } from './encounter.service';
import { PERMISSIONS } from '../auth/constants/permissions';
import type { QueueStage } from './encounter.repository';
import { ClinicAndEncounterParamsDto, ClinicIdParamDto } from '../common/request-dto';
import { ToOptionalBoolean, ToOptionalNumber, ToSanitizedString } from '../common/validation';
import { Idempotent } from '../idempotency/idempotent.decorator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

class CreateEncounterBodyDto {
  @IsUUID()
  patientId!: string;
}

export class EncounterListQueryDto {
  @IsOptional()
  @IsEnum(EncounterStatus)
  status?: EncounterStatus;

  @IsOptional()
  @IsString()
  stage?: QueueStage;

  @IsOptional()
  @ToOptionalNumber()
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;

  /** Rows to skip, so a queue lane can page past its first 50 (#307). */
  @IsOptional()
  @ToOptionalNumber()
  @IsInt()
  @Min(0)
  @Max(100000)
  skip?: number;

  /** Patient name, code or code alias (#340). */
  @IsOptional()
  @ToSanitizedString()
  @Length(1, 80)
  search?: string;

  @IsOptional()
  @IsEnum(HypertensionClassification)
  bpClassification?: HypertensionClassification;

  /** Only patients at this follow-up tier (#336). Needs FOLLOW_UP.READ. */
  @IsOptional()
  @IsEnum(FollowUpTier)
  riskTier?: FollowUpTier;

  @IsOptional()
  @ToOptionalBoolean()
  @IsBoolean()
  glucoseFlagged?: boolean;

  /** Clinic-local day, inclusive. */
  @IsOptional()
  @Matches(ISO_DATE, { message: 'createdFrom must be YYYY-MM-DD' })
  createdFrom?: string;

  /** Clinic-local day, inclusive. */
  @IsOptional()
  @Matches(ISO_DATE, { message: 'createdTo must be YYYY-MM-DD' })
  createdTo?: string;
}

@Controller('clinics/:clinicId/encounters')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class EncountersController {
  constructor(private readonly encounterService: EncounterService) {}

  @Get()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.ENCOUNTER_READ)
  async list(
    @Param() params: ClinicIdParamDto,
    @Query() query: EncounterListQueryDto,
    @Res({ passthrough: true }) res: Response,
    @Request() req: { user: ReqUserWithRoles },
  ) {
    const mayReadTier =
      isApiFeatureEnabled('followUpStratification') &&
      hasPermissionAtClinic(req.user.roles, params.clinicId, PERMISSIONS.FOLLOW_UP_READ);
    if (query.riskTier && !mayReadTier) {
      throw new ForbiddenException('Filtering by follow-up tier needs FOLLOW_UP.READ');
    }
    const { rows, total } = await this.encounterService.listQueuePage(
      params.clinicId,
      {
        status: query.status,
        // A stage only narrows the review lanes, as before.
        stage: query.status === 'IN_REVIEW' ? query.stage : undefined,
        take: query.take ?? 50,
        skip: query.skip,
        search: query.search,
        bpClassification: query.bpClassification,
        glucoseFlagged: query.glucoseFlagged,
        riskTier: query.riskTier,
        withRiskTier: mayReadTier,
      },
      { from: query.createdFrom, to: query.createdTo },
    );
    // How many match the filters, beyond this page; the body stays a plain array for callers.
    res.setHeader('X-Total-Count', String(total));
    return rows;
  }

  /** How many encounters each queue lane holds, uncapped, so a tab never stops at 50 (#307). */
  @Get('counts')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.ENCOUNTER_READ)
  async counts(@Param() params: ClinicIdParamDto) {
    return this.encounterService.countQueueLanes(params.clinicId);
  }

  @Get(':encounterId')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.ENCOUNTER_READ)
  async findOne(@Param() params: ClinicAndEncounterParamsDto) {
    const encounter = await this.encounterService.findById(params.encounterId, true);
    if (!encounter || encounter.clinicId !== params.clinicId) {
      throw new NotFoundException('Encounter not found');
    }
    return encounter;
  }

  @Post(':encounterId/submit')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.ENCOUNTER_SUBMIT_FOR_REVIEW)
  async submit(
    @Param() params: ClinicAndEncounterParamsDto,
    @Request() req: { user: { user: { id: string } } },
  ) {
    const encounter = await this.encounterService.findById(params.encounterId);
    if (!encounter || encounter.clinicId !== params.clinicId) {
      throw new NotFoundException('Encounter not found');
    }
    try {
      return await this.encounterService.submitForReview(params.encounterId, {
        clinicId: params.clinicId,
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
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.ENCOUNTER_REVIEW)
  async review(
    @Param() params: ClinicAndEncounterParamsDto,
    @Request() req: { user: { user: { id: string } } },
  ) {
    const encounter = await this.encounterService.findById(params.encounterId);
    if (!encounter || encounter.clinicId !== params.clinicId) {
      throw new NotFoundException('Encounter not found');
    }
    try {
      return await this.encounterService.reviewEncounter(params.encounterId, req.user.user.id, {
        clinicId: params.clinicId,
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
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.ENCOUNTER_REVIEW)
  async legacyPreceptorReview(
    @Param() params: ClinicAndEncounterParamsDto,
    @Request() req: { user: { user: { id: string } } },
  ) {
    return this.review(params, req);
  }

  @Post(':encounterId/finalize')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.DOCTOR_FINALIZE)
  async finalize(
    @Param() params: ClinicAndEncounterParamsDto,
    @Request() req: { user: { user: { id: string } } },
  ) {
    const encounter = await this.encounterService.findById(params.encounterId);
    if (!encounter || encounter.clinicId !== params.clinicId) {
      throw new NotFoundException('Encounter not found');
    }
    try {
      return await this.encounterService.finalize(params.encounterId, req.user.user.id, {
        clinicId: params.clinicId,
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

  @Post()
  @Idempotent()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.ENCOUNTER_CREATE)
  async create(
    @Param() params: ClinicIdParamDto,
    @Body() body: CreateEncounterBodyDto,
    @Request() req: { user: { user: { id: string }; roles: unknown[] } },
  ) {
    const dto = {
      clinicId: params.clinicId,
      patientId: body.patientId,
      createdByUserId: req.user.user.id,
    };
    try {
      return await this.encounterService.create(dto, {
        clinicId: params.clinicId,
        actorUserId: req.user.user.id,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Clinic not found') || msg.includes('Patient not found')) {
        throw new NotFoundException(msg);
      }
      throw err;
    }
  }
}
