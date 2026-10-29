import { Body, Controller, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { RbacGuard, type ReqUserWithRoles } from '../auth/guards/rbac.guard';
import { ClinicScoped } from '../auth/decorators/clinic-scoped.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../auth/constants/permissions';
import { ClinicIdParamDto } from '../common/request-dto';
import { VolunteerService } from './volunteer.service';
import {
  CreateVolunteerDto,
  LinkVolunteerDto,
  UpdateVolunteerDto,
  VolunteerParamsDto,
} from './dto/volunteer.dto';

type VolunteerRequest = { user: ReqUserWithRoles };

/** The clinic's volunteer directory (#226). Directors and managers; System Admin through `*`. */
@Controller('clinics/:clinicId/volunteers')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class VolunteerController {
  constructor(private readonly volunteerService: VolunteerService) {}

  @Get()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.VOLUNTEER_ROSTER_MANAGE)
  list(@Param() params: ClinicIdParamDto) {
    return this.volunteerService.list(params.clinicId);
  }

  @Post()
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.VOLUNTEER_ROSTER_MANAGE)
  create(
    @Param() params: ClinicIdParamDto,
    @Body() body: CreateVolunteerDto,
    @Request() req: VolunteerRequest,
  ) {
    return this.volunteerService.create(params.clinicId, req.user.user.id, body);
  }

  @Patch(':id')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.VOLUNTEER_ROSTER_MANAGE)
  update(
    @Param() params: VolunteerParamsDto,
    @Body() body: UpdateVolunteerDto,
    @Request() req: VolunteerRequest,
  ) {
    return this.volunteerService.update(params.clinicId, params.id, req.user.user.id, body);
  }

  @Post(':id/deactivate')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.VOLUNTEER_ROSTER_MANAGE)
  deactivate(@Param() params: VolunteerParamsDto, @Request() req: VolunteerRequest) {
    return this.volunteerService.setActive(params.clinicId, params.id, req.user.user.id, false);
  }

  @Post(':id/reactivate')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.VOLUNTEER_ROSTER_MANAGE)
  reactivate(@Param() params: VolunteerParamsDto, @Request() req: VolunteerRequest) {
    return this.volunteerService.setActive(params.clinicId, params.id, req.user.user.id, true);
  }

  @Post(':id/link')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.VOLUNTEER_ROSTER_MANAGE)
  link(
    @Param() params: VolunteerParamsDto,
    @Body() body: LinkVolunteerDto,
    @Request() req: VolunteerRequest,
  ) {
    return this.volunteerService.link(params.clinicId, params.id, req.user.user.id, body.userId);
  }

  @Post(':id/unlink')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.VOLUNTEER_ROSTER_MANAGE)
  unlink(@Param() params: VolunteerParamsDto, @Request() req: VolunteerRequest) {
    return this.volunteerService.unlink(params.clinicId, params.id, req.user.user.id);
  }
}
