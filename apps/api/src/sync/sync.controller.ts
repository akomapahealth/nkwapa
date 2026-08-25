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
  ParseArrayPipe,
  PayloadTooLargeException,
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
import { flattenValidationErrors } from '../common/validation';

/**
 * Nest cannot infer an element type from an array annotation, so the global ValidationPipe skipped
 * this body entirely and every constraint on SyncMutationDto was inert. An explicit ParseArrayPipe
 * is what makes them apply, which matters more here than anywhere else: entityId is used directly
 * as a database primary key.
 */
export const SYNC_PUSH_BODY_PIPE = new ParseArrayPipe({
  items: SyncMutationDto,
  whitelist: true,
  forbidNonWhitelisted: true,
  exceptionFactory: (errors) =>
    new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Sync payload validation failed.',
      fieldErrors: Array.isArray(errors) ? flattenValidationErrors(errors) : [],
      recoveryAction: 'Update the app and retry the pending changes.',
    }),
});

/** Bounds one push so a client cannot force an unbounded transaction with a single request. */
export const SYNC_PUSH_MAX_MUTATIONS = 200;

/** Kept in step with SYNC_PUSH_MAX_MUTATIONS; see the body parser configuration in main.ts. */
export const SYNC_PUSH_MAX_BODY_SIZE = '1mb';

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
    @Body(SYNC_PUSH_BODY_PIPE) mutations: SyncMutationDto[],
    @Request()
    req: {
      user: { user: { id: string }; roles: ScopedRole[] };
      ip?: string;
      headers?: { 'user-agent'?: string };
    },
  ) {
    if (mutations.length > SYNC_PUSH_MAX_MUTATIONS) {
      throw new PayloadTooLargeException({
        code: 'SYNC_BATCH_TOO_LARGE',
        message: `A sync push may carry at most ${SYNC_PUSH_MAX_MUTATIONS} mutations.`,
        maxMutations: SYNC_PUSH_MAX_MUTATIONS,
        recoveryAction: 'The app will send the remaining changes in the next batch.',
      });
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
