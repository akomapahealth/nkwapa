import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import type { ReqUser } from '../auth/auth.controller';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { ClinicScoped } from '../auth/decorators/clinic-scoped.decorator';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { PERMISSIONS } from '../auth/constants/permissions';
import { ClinicIdParamDto } from '../common/request-dto';
import { Idempotent } from '../idempotency/idempotent.decorator';
import { FollowUpRiskService } from './follow-up-risk.service';
import { FollowUpContactService } from './follow-up-contact.service';
import {
  CancelFollowUpContactDto,
  ClinicAndContactParamsDto,
  ListFollowUpContactsQueryDto,
  RecordFollowUpAttemptDto,
  TakeFollowUpContactDto,
} from './dto/follow-up-contact.dto';

/** The follow-up worklist and recording contacts (#338). Off with the flag. */
@Controller('clinics/:clinicId/follow-up/contacts')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class FollowUpContactController {
  constructor(
    private readonly risk: FollowUpRiskService,
    private readonly contacts: FollowUpContactService,
  ) {}

  private assertEnabled() {
    if (!this.risk.enabled) throw new NotFoundException();
  }

  @Get()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.FOLLOW_UP_MANAGE)
  list(
    @Param() params: ClinicIdParamDto,
    @Query() query: ListFollowUpContactsQueryDto,
    @Request() req: { user: ReqUser },
  ) {
    this.assertEnabled();
    return this.contacts.list(params.clinicId, req.user.user.id, query);
  }

  /** Open contacts due within the week, with what the sheet needs, for the device to keep. */
  @Get('offline')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.FOLLOW_UP_MANAGE)
  offline(@Param() params: ClinicIdParamDto) {
    this.assertEnabled();
    return this.contacts.offlinePacket(params.clinicId);
  }

  @Get(':contactId')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.FOLLOW_UP_MANAGE)
  detail(@Param() params: ClinicAndContactParamsDto) {
    this.assertEnabled();
    return this.contacts.detail(params.clinicId, params.contactId);
  }

  @Post(':contactId/take')
  @HttpCode(200)
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.FOLLOW_UP_MANAGE)
  take(
    @Param() params: ClinicAndContactParamsDto,
    @Body() dto: TakeFollowUpContactDto,
    @Request() req: { user: ReqUser },
  ) {
    this.assertEnabled();
    return this.contacts.take(params.clinicId, params.contactId, req.user.user.id, dto.ownerUserId);
  }

  @Post(':contactId/attempts')
  @Idempotent()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.FOLLOW_UP_MANAGE)
  recordAttempt(
    @Param() params: ClinicAndContactParamsDto,
    @Body() dto: RecordFollowUpAttemptDto,
    @Request() req: { user: ReqUser },
  ) {
    this.assertEnabled();
    return this.contacts.recordAttempt(params.clinicId, params.contactId, req.user.user.id, dto);
  }

  @Post(':contactId/cancel')
  @HttpCode(200)
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.FOLLOW_UP_MANAGE)
  cancel(
    @Param() params: ClinicAndContactParamsDto,
    @Body() dto: CancelFollowUpContactDto,
    @Request() req: { user: ReqUser },
  ) {
    this.assertEnabled();
    return this.contacts.cancel(params.clinicId, params.contactId, req.user.user.id, dto);
  }
}
