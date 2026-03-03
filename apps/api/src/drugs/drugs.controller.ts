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
import { DrugCategory } from "@prisma/client";
import { randomUUID } from "crypto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { ClinicScoped } from "../auth/decorators/clinic-scoped.decorator";
import { RbacGuard } from "../auth/guards/rbac.guard";
import { ClinicScopeGuard } from "../auth/guards/clinic-scope.guard";
import { PERMISSIONS } from "../auth/constants/permissions";
import { DrugService } from "./drug.service";
import { CreateDrugDto } from "./dto/create-drug.dto";
import { UpdateDrugDto } from "./dto/update-drug.dto";

@Controller("clinics/:clinicId/drugs")
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class DrugsController {
  constructor(private readonly drugService: DrugService) {}

  @Get()
  @ClinicScoped({ type: "param", paramKey: "clinicId" })
  @RequirePermission(PERMISSIONS.DRUG_READ)
  async search(
    @Param("clinicId") clinicId: string,
    @Query("q") q?: string,
    @Query("category") category?: string
  ) {
    return this.drugService.search(clinicId, {
      q,
      category: category as DrugCategory | undefined,
    });
  }

  @Get(":drugId")
  @ClinicScoped({ type: "param", paramKey: "clinicId" })
  @RequirePermission(PERMISSIONS.DRUG_READ)
  async findById(
    @Param("clinicId") clinicId: string,
    @Param("drugId") drugId: string
  ) {
    const drug = await this.drugService.findById(drugId);
    if (!drug) throw new NotFoundException("Drug not found");
    if (drug.clinicId !== clinicId) {
      throw new ForbiddenException("Drug does not belong to this clinic");
    }
    return drug;
  }

  @Post()
  @ClinicScoped({ type: "param", paramKey: "clinicId" })
  @RequirePermission(PERMISSIONS.DRUG_MANAGE)
  async create(
    @Param("clinicId") clinicId: string,
    @Body() body: CreateDrugDto,
    @Request() req: { user: { user: { id: string } } }
  ) {
    return this.drugService.create(clinicId, body, {
      clinicId,
      actorUserId: req.user.user.id,
      requestId: randomUUID(),
    });
  }

  @Patch(":drugId")
  @ClinicScoped({ type: "param", paramKey: "clinicId" })
  @RequirePermission(PERMISSIONS.DRUG_MANAGE)
  async update(
    @Param("clinicId") clinicId: string,
    @Param("drugId") drugId: string,
    @Body() body: UpdateDrugDto,
    @Request() req: { user: { user: { id: string } } }
  ) {
    const existing = await this.drugService.findById(drugId);
    if (!existing) throw new NotFoundException("Drug not found");
    if (existing.clinicId !== clinicId) {
      throw new ForbiddenException("Drug does not belong to this clinic");
    }
    return this.drugService.update(drugId, body, {
      clinicId,
      actorUserId: req.user.user.id,
      requestId: randomUUID(),
    });
  }
}
