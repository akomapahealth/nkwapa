import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PushSubscriptionsController } from './push-subscriptions.controller';
import { PushService } from './push.service';

/** Background Web Push (#250). Global so any module can notify without an import cycle. */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [PushSubscriptionsController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
