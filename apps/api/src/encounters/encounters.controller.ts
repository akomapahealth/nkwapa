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
} from '@nestjs/common';
import { EncounterStatus } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { ClinicScoped } from '../auth/decorators/clinic-scoped.decorator';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { EncounterService } from './encounter.service';
import { PERMISSIONS } from '../auth/constants/permissions';
import type { QueueStage } from './encounter.repository';
import { ClinicAndEncounterParamsDto, ClinicIdParamDto } from '../common/request-dto';
import { ToOptionalNumber } from '../common/validation';

class CreateEncounterBodyDto {
  @IsUUID()
  patientId!: string;
}

class EncounterListQueryDto {
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
}

@Controller('clinics/:clinicId/encounters')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class EncountersController {
  constructor(private readonly encounterService: EncounterService) {}

  @Get()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.ENCOUNTER_READ)
  async list(@Param() params: ClinicIdParamDto, @Query() query: EncounterListQueryDto) {
    if (query.status === 'IN_REVIEW' && query.stage) {
      return this.encounterService.listByClinic(params.clinicId, {
        status: 'IN_REVIEW',
        stage: query.stage,
        take: query.take ?? 50,
      });
    }
    if (query.status) {
      return this.encounterService.listByClinic(params.clinicId, {
        status: query.status,
        take: query.take ?? 50,
      });
    }
    return this.encounterService.listByClinic(params.clinicId, {
      take: query.take ?? 50,
    });
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
