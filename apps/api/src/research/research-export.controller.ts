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
import { RequestExportDto, RejectExportDto } from './dto/request-export.dto';

@Controller('clinics/:clinicId/research/exports')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class ResearchExportController {
  constructor(private readonly exportService: ResearchExportService) {}

  @Post()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.RESEARCH_EXPORT_REQUEST)
  async requestExport(
    @Param('clinicId') clinicId: string,
    @Body() body: RequestExportDto,
    @Request() req: { user: { user: { id: string } } },
  ) {
    const format = body.fileFormat === 'json' ? 'json' : 'csv';
    return this.exportService.requestExport(clinicId, req.user.user.id, format, {
      clinicId,
      actorUserId: req.user.user.id,
      requestId: randomUUID(),
    });
  }

  @Get()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.RESEARCH_EXPORT_REQUEST)
  async list(
    @Param('clinicId') clinicId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.exportService.listByClinic(
      clinicId,
      cursor,
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  @Get(':exportId')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.RESEARCH_EXPORT_REQUEST)
  async getById(
    @Param('clinicId') clinicId: string,
    @Param('exportId') exportId: string,
  ) {
    const exp = await this.exportService.findById(exportId);
    if (!exp || exp.clinicId !== clinicId) {
      throw new NotFoundException('Export not found');
    }
    return exp;
  }

  @Post(':exportId/approve')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.RESEARCH_EXPORT_APPROVE)
  async approve(
    @Param('clinicId') clinicId: string,
    @Param('exportId') exportId: string,
    @Request() req: { user: { user: { id: string } } },
  ) {
    const exp = await this.exportService.findById(exportId);
    if (!exp || exp.clinicId !== clinicId) {
      throw new NotFoundException('Export not found');
    }
    return this.exportService.approveExport(exportId, req.user.user.id, {
      clinicId,
      actorUserId: req.user.user.id,
      requestId: randomUUID(),
    });
  }

  @Post(':exportId/reject')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.RESEARCH_EXPORT_APPROVE)
  async reject(
    @Param('clinicId') clinicId: string,
    @Param('exportId') exportId: string,
    @Body() body: RejectExportDto,
    @Request() req: { user: { user: { id: string } } },
  ) {
    const exp = await this.exportService.findById(exportId);
    if (!exp || exp.clinicId !== clinicId) {
      throw new NotFoundException('Export not found');
    }
    if (!body.reason) {
      throw new BadRequestException('Rejection reason is required');
    }
    return this.exportService.rejectExport(exportId, req.user.user.id, body.reason, {
      clinicId,
      actorUserId: req.user.user.id,
      requestId: randomUUID(),
    });
  }

  @Post(':exportId/execute')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.RESEARCH_EXPORT_APPROVE)
  async execute(
    @Param('clinicId') clinicId: string,
    @Param('exportId') exportId: string,
    @Request() req: { user: { user: { id: string } } },
  ) {
    const exp = await this.exportService.findById(exportId);
    if (!exp || exp.clinicId !== clinicId) {
      throw new NotFoundException('Export not found');
    }
    return this.exportService.executeExport(exportId, req.user.user.id, {
      clinicId,
      actorUserId: req.user.user.id,
      requestId: randomUUID(),
    });
  }

  @Get(':exportId/download')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.RESEARCH_EXPORT_REQUEST)
  async download(
    @Param('clinicId') clinicId: string,
    @Param('exportId') exportId: string,
    @Res() res: Response,
  ) {
    const exp = await this.exportService.findById(exportId);
    if (!exp || exp.clinicId !== clinicId) {
      throw new NotFoundException('Export not found');
    }
    if (exp.status !== 'COMPLETED' || !exp.filePath) {
      throw new BadRequestException('Export is not ready for download');
    }
    if (!fs.existsSync(exp.filePath)) {
      throw new NotFoundException('Export file not found on disk');
    }

    const contentType = exp.fileFormat === 'json' ? 'application/json' : 'text/csv';
    const filename = `research-export-${exportId}.${exp.fileFormat ?? 'csv'}`;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const stream = fs.createReadStream(exp.filePath);
    stream.pipe(res);
  }
}
