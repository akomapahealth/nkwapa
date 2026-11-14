import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PushSubscriptionsController } from './push-subscriptions.controller';
import { PushService } from './push.service';
import { InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';
import { InboxRetentionSweep } from './inbox-retention.sweep';

/** Background Web Push (#250) and the in-app notification bell. Global so any module can notify without an import cycle. */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [PushSubscriptionsController, InboxController],
  providers: [PushService, InboxService, InboxRetentionSweep],
  exports: [PushService],
})
export class PushModule {}
