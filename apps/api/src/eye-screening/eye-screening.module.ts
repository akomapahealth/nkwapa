import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { EyeScreeningController } from './eye-screening.controller';
import { EyeScreeningService } from './eye-screening.service';

@Module({
  imports: [forwardRef(() => AuthModule), AuditModule],
  controllers: [EyeScreeningController],
  providers: [EyeScreeningService],
  exports: [EyeScreeningService],
})
export class EyeScreeningModule {}
