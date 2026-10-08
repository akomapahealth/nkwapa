import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { RbacGuard, ReqUserWithRoles } from '../auth/guards/rbac.guard';
import { ClinicScoped } from '../auth/decorators/clinic-scoped.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../auth/constants/permissions';
import { hasPermissionAtClinic } from '../auth/clinic-roles';
import { isApiFeatureEnabled } from '../common/feature-flags';
import { StationService, type StationActor } from './station.service';
import {
  AssignStationVisitDto,
  CompleteStationVisitDto,
  CreateStationDto,
  MoveCheckInDto,
  ReorderStationsDto,
  SetShiftStationDto,
  StationDayQueryDto,
  StationReasonDto,
  UpdateStationDto,
} from './dto/station.dto';

type StationRequest = {
  user: ReqUserWithRoles;
  headers?: { 'x-request-id'?: string };
};

/**
 * The station line (#167). Every route answers 404 while FEATURE_STATION_WORKFLOW_ENABLED is off,
 * so a clinic still on manager assignment sees no trace of it.
 */
@Controller('clinics/:clinicId')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class StationController {
  constructor(private readonly stationService: StationService) {}

  @Get('stations')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.OPS_STATION_READ)
  listStations(@Param('clinicId') clinicId: string) {
    this.assertEnabled();
    return this.stationService.listStations(clinicId);
  }

  @Post('stations')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.OPS_STATION_MANAGE)
  createStation(
    @Param('clinicId') clinicId: string,
    @Body() body: CreateStationDto,
    @Request() req: StationRequest,
  ) {
    this.assertEnabled();
    return this.stationService.createStation(
      clinicId,
      this.actor(req, clinicId),
      body,
      this.ctx(req),
    );
  }

  @Put('stations/order')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.OPS_STATION_MANAGE)
  reorderStations(
    @Param('clinicId') clinicId: string,
    @Body() body: ReorderStationsDto,
    @Request() req: StationRequest,
  ) {
    this.assertEnabled();
    return this.stationService.reorderStations(
      clinicId,
      this.actor(req, clinicId),
      body.stationIds,
      this.ctx(req),
    );
  }

  @Patch('stations/:stationId')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.OPS_STATION_MANAGE)
  updateStation(
    @Param('clinicId') clinicId: string,
    @Param('stationId', ParseUUIDPipe) stationId: string,
    @Body() body: UpdateStationDto,
    @Request() req: StationRequest,
  ) {
    this.assertEnabled();
    return this.stationService.updateStation(
      clinicId,
      stationId,
      this.actor(req, clinicId),
      body,
      this.ctx(req),
    );
  }

  /** Wait-time and throughput for one clinic day (#24). For the people who run the line. */
  @Get('stations/metrics')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.OPS_STATION_MANAGE)
  metrics(@Param('clinicId') clinicId: string, @Query() query: StationDayQueryDto) {
    this.assertEnabled();
    return this.stationService.getMetrics(clinicId, query.date);
  }

  @Get('stations/board')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.OPS_STATION_READ)
  getBoard(@Param('clinicId') clinicId: string, @Query() query: StationDayQueryDto) {
    this.assertEnabled();
    return this.stationService.getBoard(clinicId, query.date);
  }

  @Patch('shifts/:shiftId/station')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.OPS_STATION_WORK)
  setShiftStation(
    @Param('clinicId') clinicId: string,
    @Param('shiftId', ParseUUIDPipe) shiftId: string,
    @Body() body: SetShiftStationDto,
    @Request() req: StationRequest,
  ) {
    this.assertEnabled();
    return this.stationService.setShiftStation(
      clinicId,
      shiftId,
      this.actor(req, clinicId),
      body.stationId,
      this.ctx(req),
    );
  }

  @Get('station-visits/:visitId')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.OPS_STATION_READ)
  getVisit(@Param('clinicId') clinicId: string, @Param('visitId', ParseUUIDPipe) visitId: string) {
    this.assertEnabled();
    return this.stationService.getVisit(clinicId, visitId);
  }

  @Get('checkins/:checkInId/station-visits')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.OPS_STATION_READ)
  getTimeline(
    @Param('clinicId') clinicId: string,
    @Param('checkInId', ParseUUIDPipe) checkInId: string,
  ) {
    this.assertEnabled();
    return this.stationService.getTimeline(clinicId, checkInId);
  }

  @Get('encounters/:encounterId/station-visits')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.OPS_STATION_READ)
  getEncounterTimeline(
    @Param('clinicId') clinicId: string,
    @Param('encounterId', ParseUUIDPipe) encounterId: string,
  ) {
    this.assertEnabled();
    return this.stationService.getEncounterTimeline(clinicId, encounterId);
  }

  @Post('station-visits/:visitId/claim')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.OPS_STATION_WORK)
  claim(
    @Param('clinicId') clinicId: string,
    @Param('visitId', ParseUUIDPipe) visitId: string,
    @Request() req: StationRequest,
  ) {
    this.assertEnabled();
    return this.stationService.claim(clinicId, visitId, this.actor(req, clinicId), this.ctx(req));
  }

  /** Manager hands a waiting patient to a named person on shift. */
  @Post('station-visits/:visitId/assign')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.OPS_STATION_MANAGE)
  assign(
    @Param('clinicId') clinicId: string,
    @Param('visitId', ParseUUIDPipe) visitId: string,
    @Body() body: AssignStationVisitDto,
    @Request() req: StationRequest,
  ) {
    this.assertEnabled();
    return this.stationService.assign(
      clinicId,
      visitId,
      body.assigneeUserId,
      this.actor(req, clinicId),
      this.ctx(req),
    );
  }

  @Post('station-visits/:visitId/release')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.OPS_STATION_WORK)
  release(
    @Param('clinicId') clinicId: string,
    @Param('visitId', ParseUUIDPipe) visitId: string,
    @Body() body: StationReasonDto,
    @Request() req: StationRequest,
  ) {
    this.assertEnabled();
    return this.stationService.release(
      clinicId,
      visitId,
      this.actor(req, clinicId),
      body.reason,
      this.ctx(req),
    );
  }

  @Post('station-visits/:visitId/force-release')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.OPS_STATION_MANAGE)
  forceRelease(
    @Param('clinicId') clinicId: string,
    @Param('visitId', ParseUUIDPipe) visitId: string,
    @Body() body: StationReasonDto,
    @Request() req: StationRequest,
  ) {
    this.assertEnabled();
    return this.stationService.release(clinicId, visitId, this.actor(req, clinicId), body.reason, {
      ...this.ctx(req),
      force: true,
    });
  }

  @Post('station-visits/:visitId/complete')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.OPS_STATION_WORK)
  complete(
    @Param('clinicId') clinicId: string,
    @Param('visitId', ParseUUIDPipe) visitId: string,
    @Body() body: CompleteStationVisitDto,
    @Request() req: StationRequest,
  ) {
    this.assertEnabled();
    return this.stationService.complete(
      clinicId,
      visitId,
      this.actor(req, clinicId),
      body,
      this.ctx(req),
    );
  }

  @Post('checkins/:checkInId/move')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.OPS_STATION_MANAGE)
  move(
    @Param('clinicId') clinicId: string,
    @Param('checkInId', ParseUUIDPipe) checkInId: string,
    @Body() body: MoveCheckInDto,
    @Request() req: StationRequest,
  ) {
    this.assertEnabled();
    return this.stationService.moveCheckIn(
      clinicId,
      checkInId,
      this.actor(req, clinicId),
      body,
      this.ctx(req),
    );
  }

  /** "Patient left". The service also lets the volunteer holding the patient record it. */
  @Post('checkins/:checkInId/cancel')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.OPS_STATION_READ)
  cancel(
    @Param('clinicId') clinicId: string,
    @Param('checkInId', ParseUUIDPipe) checkInId: string,
    @Body() body: StationReasonDto,
    @Request() req: StationRequest,
  ) {
    this.assertEnabled();
    return this.stationService.cancelCheckIn(
      clinicId,
      checkInId,
      this.actor(req, clinicId),
      body.reason,
      this.ctx(req),
    );
  }

  private actor(req: StationRequest, clinicId: string): StationActor {
    return {
      userId: req.user.user.id,
      canManage: hasPermissionAtClinic(req.user.roles, clinicId, PERMISSIONS.OPS_STATION_MANAGE),
    };
  }

  private ctx(req: StationRequest) {
    return { requestId: req.headers?.['x-request-id'] ?? randomUUID() };
  }

  private assertEnabled() {
    if (!isApiFeatureEnabled('stationWorkflow')) throw new NotFoundException();
  }
}
