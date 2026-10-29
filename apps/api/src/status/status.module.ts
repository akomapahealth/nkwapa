import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StatusAdminGuard, StatusController } from './status.controller';
import { StatusService } from './status.service';

@Module({
  imports: [AuthModule],
  controllers: [StatusController],
  providers: [StatusService, StatusAdminGuard],
})
export class StatusModule {}
