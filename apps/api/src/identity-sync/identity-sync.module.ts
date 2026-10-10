import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { KeycloakModule } from '../keycloak/keycloak.module';
import { IDENTITY_SYNC_QUEUE, IdentitySyncService } from './identity-sync.service';
import { IdentitySyncProcessor } from './identity-sync.processor';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    KeycloakModule,
    BullModule.registerQueue({ name: IDENTITY_SYNC_QUEUE }),
  ],
  providers: [IdentitySyncService, IdentitySyncProcessor],
  exports: [IdentitySyncService],
})
export class IdentitySyncModule {}
