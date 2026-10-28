import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { RbacGuard, type ReqUserWithRoles } from '../auth/guards/rbac.guard';
import { ClinicScoped } from '../auth/decorators/clinic-scoped.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../auth/constants/permissions';
import { ClinicIdParamDto } from '../common/request-dto';
import { ScreeningEventService } from './screening-event.service';
import {
  AddToRosterDto,
  AssignmentParamsDto,
  CancelScreeningEventDto,
  CreateScreeningEventDto,
  EventParamsDto,
  RemoveFromRosterQueryDto,
  UpdateScreeningEventDto,
} from './dto/volunteer.dto';

type EventRequest = { user: ReqUserWithRoles };

/** Screening days and their rosters (#226). Same audience as the volunteer directory. */
@Controller('clinics/:clinicId/screening-events')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class ScreeningEventController {
  constructor(private readonly eventService: ScreeningEventService) {}

  @Get()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.VOLUNTEER_ROSTER_MANAGE)
  list(@Param() params: ClinicIdParamDto) {
    return this.eventService.list(params.clinicId);
  }

  @Post()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.VOLUNTEER_ROSTER_MANAGE)
  create(
    @Param() params: ClinicIdParamDto,
    @Body() body: CreateScreeningEventDto,
    @Request() req: EventRequest,
  ) {
    return this.eventService.create(params.clinicId, req.user.user.id, body);
  }

  @Get(':eventId')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.VOLUNTEER_ROSTER_MANAGE)
  get(@Param() params: EventParamsDto) {
    return this.eventService.get(params.clinicId, params.eventId);
  }

  @Patch(':eventId')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.VOLUNTEER_ROSTER_MANAGE)
  update(
    @Param() params: EventParamsDto,
    @Body() body: UpdateScreeningEventDto,
    @Request() req: EventRequest,
  ) {
    return this.eventService.update(params.clinicId, params.eventId, req.user.user.id, body);
  }

  @Post(':eventId/cancel')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.VOLUNTEER_ROSTER_MANAGE)
  cancel(
    @Param() params: EventParamsDto,
    @Body() body: CancelScreeningEventDto,
    @Request() req: EventRequest,
  ) {
    return this.eventService.cancel(params.clinicId, params.eventId, req.user.user.id, body);
  }

  @Post(':eventId/roster')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.VOLUNTEER_ROSTER_MANAGE)
  addToRoster(
    @Param() params: EventParamsDto,
    @Body() body: AddToRosterDto,
    @Request() req: EventRequest,
  ) {
    return this.eventService.addToRoster(
      params.clinicId,
      params.eventId,
      req.user.user.id,
      body.volunteerContactIds,
    );
  }

  @Delete(':eventId/roster/:assignmentId')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.VOLUNTEER_ROSTER_MANAGE)
  removeFromRoster(
    @Param() params: AssignmentParamsDto,
    @Query() query: RemoveFromRosterQueryDto,
    @Request() req: EventRequest,
  ) {
    return this.eventService.removeFromRoster(
      params.clinicId,
      params.eventId,
      params.assignmentId,
      req.user.user.id,
      query.notify === true,
    );
  }

  @Post(':eventId/notify')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.VOLUNTEER_ROSTER_MANAGE)
  notify(@Param() params: EventParamsDto, @Request() req: EventRequest) {
    return this.eventService.notify(params.clinicId, params.eventId, req.user.user.id);
  }

  @Post(':eventId/roster/:assignmentId/resend')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.VOLUNTEER_ROSTER_MANAGE)
  resend(@Param() params: AssignmentParamsDto, @Request() req: EventRequest) {
    return this.eventService.resend(
      params.clinicId,
      params.eventId,
      params.assignmentId,
      req.user.user.id,
    );
  }
}
