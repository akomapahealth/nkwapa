import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { ReqUser } from '../auth/auth.controller';
import { RateLimit } from '../common/rate-limit.decorator';
import { OfflineGrantService } from './offline-grant.service';

export class IssueOfflineGrantDto {
  @IsUUID()
  deviceId!: string;
}

export class DeviceKeysDto {
  @IsUUID()
  deviceId!: string;

  /** Only a system admin needs it: everyone else gets the clinics they work in. */
  @IsOptional()
  @IsUUID()
  clinicId?: string;
}

export class RevokeOfflineGrantDto {
  @IsOptional()
  @IsIn(['SIGN_OUT', 'DEVICE_REVOKED'])
  reason?: 'SIGN_OUT' | 'DEVICE_REVOKED';
}

/** Offline session resume (#207). See `docs/security/offline-session-matrix.md`. */
@Controller('auth')
export class OfflineGrantController {
  constructor(private readonly grants: OfflineGrantService) {}

  /** The keys grants are signed with. Public, so a device can check a grant it already holds. */
  @Get('offline-grant/keys')
  @RateLimit({ key: 'auth_offline_grant_keys', limit: 60, windowSeconds: 60, scope: 'user-or-ip' })
  keys() {
    return { keys: this.grants.publicKeys() };
  }

  /**
   * Issue or refresh this device's grant, with this person's data key for it. Called after a
   * successful whoami on a device that opted in, and at most hourly while online.
   */
  @UseGuards(JwtAuthGuard)
  @Post('offline-grant')
  @HttpCode(200)
  // The response carries a key: nothing between here and the device may keep a copy.
  @Header('Cache-Control', 'no-store')
  @RateLimit({ key: 'auth_offline_grant', limit: 20, windowSeconds: 60, scope: 'user-or-ip' })
  issue(
    @Request() req: { user: ReqUser; headers?: { 'user-agent'?: string } },
    @Body() dto: IssueOfflineGrantDto,
  ) {
    return this.grants.issue(req.user, dto.deviceId, req.headers?.['user-agent']);
  }

  /**
   * The keys this device encrypts its local copy of clinical data with (#207). Fetched on every
   * online sign-in, opted in or not: nothing clinical is written to the device without one.
   */
  @UseGuards(JwtAuthGuard)
  @Post('device-keys')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  // Called after every whoami, so it gets whoami's budget.
  @RateLimit({ key: 'auth_device_keys', limit: 60, windowSeconds: 60, scope: 'user-or-ip' })
  deviceKeys(@Request() req: { user: ReqUser }, @Body() dto: DeviceKeysDto) {
    return { keys: this.grants.deviceKeys(req.user, dto.deviceId, dto.clinicId) };
  }

  /** The caller's devices that can still resume offline. */
  @UseGuards(JwtAuthGuard)
  @Get('offline-grants')
  @RateLimit({ key: 'auth_offline_grants', limit: 60, windowSeconds: 60, scope: 'user-or-ip' })
  async list(@Request() req: { user: ReqUser }) {
    return { grants: await this.grants.listLive(req.user.user.id) };
  }

  /** Withdraw offline access from one of the caller's devices. Idempotent. */
  @UseGuards(JwtAuthGuard)
  @Post('offline-grants/:grantId/revoke')
  @HttpCode(204)
  @RateLimit({
    key: 'auth_offline_grant_revoke',
    limit: 20,
    windowSeconds: 60,
    scope: 'user-or-ip',
  })
  async revoke(
    @Request() req: { user: ReqUser },
    @Param('grantId', new ParseUUIDPipe()) grantId: string,
    @Body() dto: RevokeOfflineGrantDto,
  ): Promise<void> {
    const clinicId = req.user.roles.find((entry) => entry.clinicId)?.clinicId ?? null;
    await this.grants.revokeOwn(
      req.user.user.id,
      grantId,
      dto.reason ?? 'DEVICE_REVOKED',
      clinicId,
    );
  }
}
