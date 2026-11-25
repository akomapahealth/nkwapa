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
import { DoctorRequestService } from './doctor-request.service';
import {
  AssignStationVisitDto,
  CompleteStationVisitDto,
  CorrectPerformerDto,
  CreateStationDto,
  MoveCheckInDto,
  ReorderStationsDto,
  ScreenerDto,
  SetShiftStationDto,
  StationDayQueryDto,
  StationReasonDto,
  UpdateStationDto,
  CreateDoctorRequestDto,
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
  constructor(
    private readonly stationService: StationService,
    private readonly doctorRequests: DoctorRequestService,
  ) {}

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

  /** The nav badge for whoever is on shift at review (#419); `{count: null}` for everyone else. */
  @Get('stations/review-waiting/count')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.OPS_STATION_READ)
  reviewWaitingCount(@Param('clinicId') clinicId: string, @Request() req: StationRequest) {
    this.assertEnabled();
    return this.stationService.getReviewWaitingCount(clinicId, req.user.user.id);
  }

  @Get('stations/screener-names')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.OPS_STATION_WORK)
  getScreenerNames(@Param('clinicId') clinicId: string) {
    this.assertEnabled();
    return this.stationService.getScreenerNames(clinicId);
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

  @Patch('shifts/:shiftId/screener')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.OPS_STATION_WORK)
  setShiftScreener(
    @Param('clinicId') clinicId: string,
    @Param('shiftId', ParseUUIDPipe) shiftId: string,
    @Body() body: ScreenerDto,
    @Request() req: StationRequest,
  ) {
    this.assertEnabled();
    return this.stationService.setShiftScreener(
      clinicId,
      shiftId,
      this.actor(req, clinicId),
      body,
      this.ctx(req),
    );
  }

  @Patch('station-visits/:visitId/performer')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.OPS_STATION_WORK)
  correctPerformer(
    @Param('clinicId') clinicId: string,
    @Param('visitId', ParseUUIDPipe) visitId: string,
    @Body() body: CorrectPerformerDto,
    @Request() req: StationRequest,
  ) {
    this.assertEnabled();
    return this.stationService.correctPerformer(
      clinicId,
      visitId,
      this.actor(req, clinicId),
      body,
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

  /** "End clinic day": everyone still in the line is closed out as CLINIC_CLOSED. */
  @Post('stations/day/close')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.OPS_STATION_MANAGE)
  closeDay(
    @Param('clinicId') clinicId: string,
    @Query() query: StationDayQueryDto,
    @Request() req: StationRequest,
  ) {
    this.assertEnabled();
    return this.stationService.closeClinicDay(
      clinicId,
      this.actor(req, clinicId),
      query.date,
      this.ctx(req),
    );
  }

  /** "Ask a doctor" (#418): the doctors on shift are told, with no patient name. */
  @Post('station-visits/:visitId/doctor-request')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.OPS_STATION_WORK)
  requestDoctor(
    @Param('clinicId') clinicId: string,
    @Param('visitId', ParseUUIDPipe) visitId: string,
    @Body() body: CreateDoctorRequestDto,
    @Request() req: StationRequest,
  ) {
    this.assertEnabled();
    return this.doctorRequests.request(
      clinicId,
      visitId,
      req.user.user.id,
      body,
      this.ctx(req).requestId,
    );
  }

  /** "I'm on it": doctors, and managers who review (#418). */
  @Post('doctor-requests/:requestId/claim')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.ENCOUNTER_REVIEW)
  claimDoctorRequest(
    @Param('clinicId') clinicId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Request() req: StationRequest,
  ) {
    this.assertEnabled();
    return this.doctorRequests.claim(
      clinicId,
      requestId,
      req.user.user.id,
      this.ctx(req).requestId,
    );
  }

  /** "Seen", by the doctor who took it. */
  @Post('doctor-requests/:requestId/resolve')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.ENCOUNTER_REVIEW)
  resolveDoctorRequest(
    @Param('clinicId') clinicId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Request() req: StationRequest,
  ) {
    this.assertEnabled();
    return this.doctorRequests.resolve(
      clinicId,
      requestId,
      req.user.user.id,
      this.ctx(req).requestId,
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
