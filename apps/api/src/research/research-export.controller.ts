import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Request,
  Res,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { ClinicScoped } from '../auth/decorators/clinic-scoped.decorator';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { PERMISSIONS } from '../auth/constants/permissions';
import { ResearchExportService } from './research-export.service';
import { RejectExportDto, RequestExportDto } from './dto/request-export.dto';
import {
  ClinicAndExportParamsDto,
  ClinicIdParamDto,
  CursorLimitQueryDto,
} from '../common/request-dto';

@Controller('clinics/:clinicId/research/exports')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class ResearchExportController {
  constructor(private readonly exportService: ResearchExportService) {}

  @Post()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.RESEARCH_EXPORT_REQUEST)
  async requestExport(
    @Param() params: ClinicIdParamDto,
    @Body() body: RequestExportDto,
    @Request() req: { user: { user: { id: string } } },
  ) {
    return this.exportService.requestExport(params.clinicId, req.user.user.id, body, {
      clinicId: params.clinicId,
      actorUserId: req.user.user.id,
      requestId: randomUUID(),
    });
  }

  @Get()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.RESEARCH_EXPORT_REQUEST)
  async list(@Param() params: ClinicIdParamDto, @Query() query: CursorLimitQueryDto) {
    return this.exportService.listByClinic(params.clinicId, query.cursor, query.limit);
  }

  @Get(':exportId')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.RESEARCH_EXPORT_REQUEST)
  async getById(@Param() params: ClinicAndExportParamsDto) {
    const exp = await this.exportService.findById(params.exportId);
    if (!exp || exp.clinicId !== params.clinicId) {
      throw new NotFoundException('Export not found');
    }
    return exp;
  }

  @Post(':exportId/approve')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.RESEARCH_EXPORT_APPROVE)
  async approve(
    @Param() params: ClinicAndExportParamsDto,
    @Request() req: { user: { user: { id: string } } },
  ) {
    const exp = await this.exportService.findRecordById(params.exportId);
    if (!exp || exp.clinicId !== params.clinicId) {
      throw new NotFoundException('Export not found');
    }
    return this.exportService.approveExport(params.exportId, req.user.user.id, {
      clinicId: params.clinicId,
      actorUserId: req.user.user.id,
      requestId: randomUUID(),
    });
  }

  @Post(':exportId/reject')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.RESEARCH_EXPORT_APPROVE)
  async reject(
    @Param() params: ClinicAndExportParamsDto,
    @Body() body: RejectExportDto,
    @Request() req: { user: { user: { id: string } } },
  ) {
    const exp = await this.exportService.findRecordById(params.exportId);
    if (!exp || exp.clinicId !== params.clinicId) {
      throw new NotFoundException('Export not found');
    }
    return this.exportService.rejectExport(params.exportId, req.user.user.id, body.reason, {
      clinicId: params.clinicId,
      actorUserId: req.user.user.id,
      requestId: randomUUID(),
    });
  }

  @Patch(':exportId/retry')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.RESEARCH_EXPORT_APPROVE)
  async retry(
    @Param() params: ClinicAndExportParamsDto,
    @Request() req: { user: { user: { id: string } } },
  ) {
    const exp = await this.exportService.findRecordById(params.exportId);
    if (!exp || exp.clinicId !== params.clinicId) {
      throw new NotFoundException('Export not found');
    }
    return this.exportService.retryExport(params.exportId, req.user.user.id, {
      clinicId: params.clinicId,
      actorUserId: req.user.user.id,
      requestId: randomUUID(),
    });
  }

  @Get(':exportId/download')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.RESEARCH_EXPORT_REQUEST)
  async download(
    @Param() params: ClinicAndExportParamsDto,
    @Request() req: { user: { user: { id: string } } },
    @Res() res: Response,
  ) {
    const exp = await this.exportService.findById(params.exportId);
    if (!exp || exp.clinicId !== params.clinicId) {
      throw new NotFoundException('Export not found');
    }
    if (exp.status !== 'COMPLETED' || !exp.filePath) {
      throw new BadRequestException('Export is not ready for download');
    }
    if (!fs.existsSync(exp.filePath)) {
      throw new NotFoundException('Export file not found on disk');
    }

    await this.exportService.recordDownload(params.exportId, {
      clinicId: params.clinicId,
      actorUserId: req.user.user.id,
      requestId: randomUUID(),
    });

    const contentType = 'application/zip';
    const filename = `research-export-${params.exportId}.zip`;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const stream = fs.createReadStream(exp.filePath);
    stream.pipe(res);
  }
}
