import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { CounsellingController } from './counselling.controller';
import { CounsellingService } from './counselling.service';

@Module({
  imports: [forwardRef(() => AuthModule), AuditModule],
  controllers: [CounsellingController],
  providers: [CounsellingService],
  exports: [CounsellingService],
})
export class CounsellingModule {}
