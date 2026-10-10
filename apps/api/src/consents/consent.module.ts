import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { ConsentService } from './consent.service';
import { ConsentsController } from './consents.controller';

@Module({
  imports: [PrismaModule, forwardRef(() => AuthModule), AuditModule],
  controllers: [ConsentsController],
  providers: [ConsentService],
  exports: [ConsentService],
})
export class ConsentModule {}
