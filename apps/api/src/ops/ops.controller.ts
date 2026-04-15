import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
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
import { OpsService } from './ops.service';
import {
  ActiveShiftsQueryDto,
  CreateAssignmentDto,
  CreatePatientCheckInDto,
  ListAssignmentsQueryDto,
  ListCheckInsQueryDto,
  ListMyAssignmentsQueryDto,
  ReassignAssignmentDto,
  ShiftCheckInDto,
} from './dto/ops.dto';

@Controller('clinics/:clinicId')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class OpsController {
  constructor(private readonly opsService: OpsService) {}

  @Post('shifts/check-in')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.OPS_SHIFT_WRITE)
  async checkIn(
    @Param('clinicId') clinicId: string,
    @Body() body: ShiftCheckInDto,
    @Request()
    req: {
      user: ReqUserWithRoles;
      headers?: { 'x-request-id'?: string };
    },
  ) {
    return this.opsService.checkIn(
      clinicId,
      req.user.user.id,
      body,
      req.headers?.['x-request-id'] ?? randomUUID(),
    );
  }

  @Post('shifts/:shiftId/check-out')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.OPS_SHIFT_WRITE)
  async checkOut(
    @Param('clinicId') clinicId: string,
    @Param('shiftId') shiftId: string,
    @Request()
    req: {
      user: ReqUserWithRoles;
      headers?: { 'x-request-id'?: string };
    },
  ) {
    return this.opsService.checkOut(
      clinicId,
      shiftId,
      req.user.user.id,
      req.headers?.['x-request-id'] ?? randomUUID(),
    );
  }

  @Get('shifts/active')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.OPS_SHIFT_READ)
  async getActiveShifts(@Param('clinicId') clinicId: string, @Query() query: ActiveShiftsQueryDto) {
    return this.opsService.getActiveShifts(clinicId, query.date);
  }

  @Post('checkins')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.OPS_CHECKIN_CREATE)
  async createCheckIn(
    @Param('clinicId') clinicId: string,
    @Body() body: CreatePatientCheckInDto,
    @Request()
    req: {
      user: ReqUserWithRoles;
      headers?: { 'x-request-id'?: string };
    },
  ) {
    return this.opsService.createCheckIn(
      clinicId,
      req.user.user.id,
      body,
      req.headers?.['x-request-id'] ?? randomUUID(),
    );
  }

  @Get('checkins')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.OPS_CHECKIN_READ)
  async listCheckIns(@Param('clinicId') clinicId: string, @Query() query: ListCheckInsQueryDto) {
    return this.opsService.listCheckIns(clinicId, query);
  }

  @Post('assignments')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.OPS_ASSIGNMENT_MANAGE)
  async createAssignment(
    @Param('clinicId') clinicId: string,
    @Body() body: CreateAssignmentDto,
    @Request()
    req: {
      user: ReqUserWithRoles;
      headers?: { 'x-request-id'?: string };
    },
  ) {
    return this.opsService.createAssignment(
      clinicId,
      req.user.user.id,
      body,
      req.headers?.['x-request-id'] ?? randomUUID(),
    );
  }

  @Patch('assignments/:assignmentId/reassign')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.OPS_ASSIGNMENT_MANAGE)
  async reassign(
    @Param('clinicId') clinicId: string,
    @Param('assignmentId') assignmentId: string,
    @Body() body: ReassignAssignmentDto,
    @Request()
    req: {
      user: ReqUserWithRoles;
      headers?: { 'x-request-id'?: string };
    },
  ) {
    return this.opsService.reassignAssignment(
      clinicId,
      assignmentId,
      req.user.user.id,
      body,
      req.headers?.['x-request-id'] ?? randomUUID(),
    );
  }

  @Get('assignments')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.OPS_CHECKIN_READ)
  async listAssignments(
    @Param('clinicId') clinicId: string,
    @Query() query: ListAssignmentsQueryDto,
  ) {
    return this.opsService.listAssignments(clinicId, query);
  }

  @Get('my/assignments')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.OPS_ASSIGNMENT_READ_SELF)
  async listMyAssignments(
    @Param('clinicId') clinicId: string,
    @Query() query: ListMyAssignmentsQueryDto,
    @Request() req: { user: ReqUserWithRoles },
  ) {
    return this.opsService.listMyAssignments(clinicId, req.user.user.id, query.date);
  }

  @Post('checkins/:checkinId/start-intake')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.ENCOUNTER_CREATE)
  async startIntake(
    @Param('clinicId') clinicId: string,
    @Param('checkinId') checkinId: string,
    @Request()
    req: {
      user: ReqUserWithRoles;
      headers?: { 'x-request-id'?: string };
    },
  ) {
    return this.opsService.startIntake(
      clinicId,
      checkinId,
      req.user.user.id,
      req.headers?.['x-request-id'] ?? randomUUID(),
    );
  }
}
