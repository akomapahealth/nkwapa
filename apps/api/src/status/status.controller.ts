import {
  CanActivate,
  Controller,
  ExecutionContext,
  ForbiddenException,
  Get,
  Injectable,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { isSystemAdmin } from '../auth/clinic-roles';
import { ReqUserWithRoles } from '../auth/guards/rbac.guard';
import { StatusService } from './status.service';

@Injectable()
export class StatusAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<{ user?: ReqUserWithRoles }>().user;
    if (!user || !isSystemAdmin(user.roles))
      throw new ForbiddenException('Insufficient permissions');
    return true;
  }
}

@Controller('status')
export class StatusController {
  constructor(private readonly status: StatusService) {}

  @Get()
  publicStatus() {
    return this.status.publicStatus();
  }

  @Get('details')
  @UseGuards(JwtAuthGuard, StatusAdminGuard)
  details() {
    return this.status.details();
  }
}
