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
} from '@nestjs/common';
import { DrugCategory } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { randomUUID } from 'crypto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { ClinicScoped } from '../auth/decorators/clinic-scoped.decorator';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { PERMISSIONS } from '../auth/constants/permissions';
import { DrugService } from './drug.service';
import { CreateDrugDto } from './dto/create-drug.dto';
import { UpdateDrugDto } from './dto/update-drug.dto';
import { ClinicAndDrugParamsDto, ClinicIdParamDto, SearchQueryDto } from '../common/request-dto';

class DrugSearchQueryDto extends SearchQueryDto {
  @IsOptional()
  @IsEnum(DrugCategory)
  category?: DrugCategory;
}

@Controller('clinics/:clinicId/drugs')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class DrugsController {
  constructor(private readonly drugService: DrugService) {}

  @Get()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.DRUG_READ)
  async search(@Param() params: ClinicIdParamDto, @Query() query: DrugSearchQueryDto) {
    return this.drugService.search(params.clinicId, {
      q: query.q,
      category: query.category,
    });
  }

  @Get(':drugId')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.DRUG_READ)
  async findById(@Param() params: ClinicAndDrugParamsDto) {
    const drug = await this.drugService.findById(params.drugId);
    if (!drug) throw new NotFoundException('Drug not found');
    if (drug.clinicId !== params.clinicId) {
      throw new ForbiddenException('Drug does not belong to this clinic');
    }
    return drug;
  }

  @Post()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.DRUG_MANAGE)
  async create(
    @Param() params: ClinicIdParamDto,
    @Body() body: CreateDrugDto,
    @Request() req: { user: { user: { id: string } } },
  ) {
    return this.drugService.create(params.clinicId, body, {
      clinicId: params.clinicId,
      actorUserId: req.user.user.id,
      requestId: randomUUID(),
    });
  }

  @Patch(':drugId')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.DRUG_MANAGE)
  async update(
    @Param() params: ClinicAndDrugParamsDto,
    @Body() body: UpdateDrugDto,
    @Request() req: { user: { user: { id: string } } },
  ) {
    const existing = await this.drugService.findById(params.drugId);
    if (!existing) throw new NotFoundException('Drug not found');
    if (existing.clinicId !== params.clinicId) {
      throw new ForbiddenException('Drug does not belong to this clinic');
    }
    return this.drugService.update(params.drugId, body, {
      clinicId: params.clinicId,
      actorUserId: req.user.user.id,
      requestId: randomUUID(),
    });
  }
}
