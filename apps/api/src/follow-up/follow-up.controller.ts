import {
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
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
import { ClinicAndPatientParamsDto } from '../common/request-dto';
import { PrismaService } from '../prisma/prisma.service';
import { FollowUpRiskService } from './follow-up-risk.service';
import { FollowUpFlagService } from './follow-up-flags.service';

/** Enough history to show how a patient moved, without paging. */
const HISTORY_LIMIT = 20;

@Controller('clinics/:clinicId/patients/:patientId/follow-up')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class FollowUpController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly risk: FollowUpRiskService,
    private readonly flags: FollowUpFlagService,
  ) {}

  /**
   * The patient's current tier and how it got there, newest first. `current` is null until the
   * first recompute. The engine's input snapshot stays server-side: it is for tracing, not display.
   * `urgentFlag` is set while they are Urgent, with who has taken it (#337).
   */
  @Get()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.FOLLOW_UP_READ)
  async get(@Param() params: ClinicAndPatientParamsDto) {
    if (!this.risk.enabled) throw new NotFoundException();
    const history = await this.prisma.patientRiskAssessment.findMany({
      where: { patientId: params.patientId, clinicId: params.clinicId },
      orderBy: { computedAt: 'desc' },
      take: HISTORY_LIMIT,
      omit: { inputSnapshot: true, triggeredByUserId: true },
    });
    const urgentFlag = await this.flags.openUrgentFlag(params.clinicId, params.patientId);
    return { current: history[0] ?? null, history, urgentFlag };
  }

  /** "I'm on it" on an Urgent patient (#337). Taking one someone already took returns theirs. */
  @Post('acknowledge')
  @HttpCode(200)
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.FOLLOW_UP_MANAGE)
  acknowledge(@Param() params: ClinicAndPatientParamsDto, @Request() req: { user: ReqUser }) {
    if (!this.risk.enabled) throw new NotFoundException();
    return this.flags.acknowledge(params.clinicId, params.patientId, req.user.user.id);
  }
}
