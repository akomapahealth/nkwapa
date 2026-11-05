import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { InviteRenewalController } from './invite-renewal.controller';
import { InviteRenewalService } from './invite-renewal.service';

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [InviteRenewalController],
  providers: [InviteRenewalService],
})
export class InviteRenewalModule {}
