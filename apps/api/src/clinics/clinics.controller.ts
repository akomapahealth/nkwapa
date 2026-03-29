import { Controller, Get, Param, UseGuards, Request, NotFoundException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { ClinicScoped } from '../auth/decorators/clinic-scoped.decorator';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { ClinicService } from './clinic.service';
import { PERMISSIONS } from '../auth/constants/permissions';

@Controller('clinics')
export class ClinicsController {
  constructor(private readonly clinicService: ClinicService) {}

  @UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
  @RequirePermission(PERMISSIONS.CLINIC_READ)
  @ClinicScoped({ type: 'param', paramKey: 'id' })
  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Request() _req: { user: { user: { id: string }; roles: unknown[] } },
  ) {
    const clinic = await this.clinicService.findById(id);
    if (!clinic) {
      throw new NotFoundException('Clinic not found');
    }
    return clinic;
  }
}
