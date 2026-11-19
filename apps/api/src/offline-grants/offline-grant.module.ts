import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClinicModule } from '../clinics/clinic.module';
import { OfflineGrantController } from './offline-grant.controller';
import { OfflineGrantKeysService } from './offline-grant-keys.service';
import { OfflineGrantService } from './offline-grant.service';

/** Offline session resume (#207): grants, their keys, and revocation. */
@Module({
  imports: [AuthModule, forwardRef(() => ClinicModule)],
  controllers: [OfflineGrantController],
  providers: [OfflineGrantService, OfflineGrantKeysService],
  exports: [OfflineGrantService],
})
export class OfflineGrantModule {}
