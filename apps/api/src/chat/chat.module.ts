import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { ChatEncryptionBackfillSweep } from './chat-encryption-backfill.sweep';

@Module({
  imports: [PrismaModule, AuditModule, AuthModule],
  providers: [ChatService, ChatGateway, ChatEncryptionBackfillSweep],
  controllers: [ChatController],
  exports: [ChatService],
})
export class ChatModule {}
