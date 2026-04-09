import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { RbacGuard, ReqUserWithRoles } from '../auth/guards/rbac.guard';
import { ClinicScoped } from '../auth/decorators/clinic-scoped.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../auth/constants/permissions';
import { ChatService } from './chat.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { ListConversationsQueryDto } from './dto/list-conversations-query.dto';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto';

@Controller('clinics/:clinicId/chat')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('conversations')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.CHAT_READ)
  async listConversations(
    @Param('clinicId') clinicId: string,
    @Query() query: ListConversationsQueryDto,
    @Request() req: { user: ReqUserWithRoles },
  ) {
    return this.chatService.listConversations(clinicId, req.user.user.id, query.limit ?? 30);
  }

  @Post('conversations')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.CHAT_SEND)
  async createConversation(
    @Param('clinicId') clinicId: string,
    @Body() body: CreateConversationDto,
    @Request()
    req: {
      user: ReqUserWithRoles;
      headers?: { 'x-request-id'?: string };
    },
  ) {
    return this.chatService.findOrCreateDirectConversation(
      clinicId,
      req.user.user.id,
      body.participantUserId,
      req.headers?.['x-request-id'] ?? randomUUID(),
    );
  }

  @Get('conversations/:conversationId/messages')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.CHAT_READ)
  async listMessages(
    @Param('clinicId') clinicId: string,
    @Param('conversationId') conversationId: string,
    @Query() query: ListMessagesQueryDto,
    @Request() req: { user: ReqUserWithRoles },
  ) {
    return this.chatService.listMessages(
      conversationId,
      req.user.user.id,
      clinicId,
      query.cursor,
      query.limit,
    );
  }

  @Post('conversations/:conversationId/read')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.CHAT_READ)
  async markRead(
    @Param('conversationId') conversationId: string,
    @Request() req: { user: ReqUserWithRoles },
  ) {
    return this.chatService.markConversationRead(conversationId, req.user.user.id);
  }

  @Get('users')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.CHAT_READ)
  async listClinicUsers(
    @Param('clinicId') clinicId: string,
    @Request() req: { user: ReqUserWithRoles },
  ) {
    return this.chatService.listClinicChatUsers(clinicId, req.user.user.id);
  }
}
