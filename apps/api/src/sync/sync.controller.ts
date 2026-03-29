import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Request,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { ClinicScoped } from '../auth/decorators/clinic-scoped.decorator';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { PERMISSIONS } from '../auth/constants/permissions';
import { SyncService } from './sync.service';
import { SyncMutationDto } from './dto/sync-mutation.dto';

@Controller('sync')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('push')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PERMISSIONS.SYNC_PUSH)
  @ClinicScoped({ type: 'query', queryKey: 'clinicId' })
  async push(
    @Query('clinicId') clinicId: string,
    @Body() mutations: SyncMutationDto[],
    @Request() req: { user: { user: { id: string }; roles: unknown[] }; ip?: string; headers?: { 'user-agent'?: string } }
  ) {
    if (!clinicId) {
      throw new BadRequestException('clinicId query parameter is required');
    }
    if (!Array.isArray(mutations)) {
      throw new BadRequestException('Body must be an array of mutations');
    }
    const results = await this.syncService.applyMutations(
      clinicId,
      req.user,
      mutations,
      {
        ipAddress: req.ip,
        userAgent: req.headers?.['user-agent'],
      }
    );
    return { results };
  }

  @Get('pull')
  @RequirePermission(PERMISSIONS.SYNC_PULL)
  @ClinicScoped({ type: 'query', queryKey: 'clinicId' })
  async pull(
    @Query('clinicId') clinicId: string,
    @Query('since') since?: string
  ) {
    if (!clinicId) {
      throw new BadRequestException('clinicId query parameter is required');
    }
    return this.syncService.pull(clinicId, since);
  }
}
