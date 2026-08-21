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
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import type { ScopedRole } from '../auth/clinic-roles';
import { ClinicScoped } from '../auth/decorators/clinic-scoped.decorator';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { PERMISSIONS } from '../auth/constants/permissions';
import { SyncService } from './sync.service';
import { SyncMutationDto } from './dto/sync-mutation.dto';
import { RateLimit } from '../common/rate-limit.decorator';

class SyncQueryDto {
  @IsUUID()
  clinicId!: string;
}

class SyncPullQueryDto extends SyncQueryDto {
  @IsOptional()
  @IsString()
  since?: string;
}

@Controller('sync')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('push')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PERMISSIONS.SYNC_PUSH)
  @ClinicScoped({ type: 'query', queryKey: 'clinicId' })
  @RateLimit({ key: 'sync_push', limit: 30, windowSeconds: 60, scope: 'user-or-ip' })
  async push(
    @Query() query: SyncQueryDto,
    @Body() mutations: SyncMutationDto[],
    @Request()
    req: {
      user: { user: { id: string }; roles: ScopedRole[] };
      ip?: string;
      headers?: { 'user-agent'?: string };
    },
  ) {
    if (!Array.isArray(mutations)) {
      throw new BadRequestException('Body must be an array of mutations');
    }
    const results = await this.syncService.applyMutations(query.clinicId, req.user, mutations, {
      ipAddress: req.ip,
      userAgent: req.headers?.['user-agent'],
    });
    return { results };
  }

  @Get('pull')
  @RequirePermission(PERMISSIONS.SYNC_PULL)
  @ClinicScoped({ type: 'query', queryKey: 'clinicId' })
  @RateLimit({ key: 'sync_pull', limit: 60, windowSeconds: 60, scope: 'user-or-ip' })
  async pull(@Query() query: SyncPullQueryDto) {
    return this.syncService.pull(query.clinicId, query.since);
  }
}
