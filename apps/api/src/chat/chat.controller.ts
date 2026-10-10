import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
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
import {
  AddParticipantsDto,
  CreateGroupConversationDto,
  RenameConversationDto,
} from './dto/group-conversation.dto';
import { ChatGateway } from './chat.gateway';

type ChatRequest = { user: ReqUserWithRoles; headers?: { 'x-request-id'?: string } };
const requestIdOf = (req: ChatRequest) => req.headers?.['x-request-id'] ?? randomUUID();

@Controller('clinics/:clinicId/chat')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly gateway: ChatGateway,
  ) {}

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
    const conversation = await this.chatService.findOrCreateDirectConversation(
      clinicId,
      req.user.user.id,
      body.participantUserId,
      req.headers?.['x-request-id'] ?? randomUUID(),
    );
    // The other person's list gains it now, not on their next reload.
    this.gateway.notifyConversationChanged(conversation.id, {
      memberIds: [body.participantUserId],
      kind: 'new',
    });
    return conversation;
  }

  /** A group conversation: the caller and at least two others who can chat here (#30). */
  @Post('conversations/group')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.CHAT_SEND)
  async createGroup(
    @Param('clinicId') clinicId: string,
    @Body() body: CreateGroupConversationDto,
    @Request() req: ChatRequest,
  ) {
    const conversation = await this.chatService.createGroupConversation(
      clinicId,
      req.user.user.id,
      { title: body.title ?? null, participantUserIds: body.participantUserIds },
      requestIdOf(req),
    );
    this.gateway.notifyConversationChanged(conversation.id, {
      memberIds: conversation.participants
        .map((p) => p.userId)
        .filter((id) => id !== req.user.user.id),
      kind: 'new',
    });
    return conversation;
  }

  @Post('conversations/:conversationId/participants')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.CHAT_SEND)
  async addParticipants(
    @Param('clinicId') clinicId: string,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Body() body: AddParticipantsDto,
    @Request() req: ChatRequest,
  ) {
    const { conversation, added } = await this.chatService.addParticipants(
      conversationId,
      req.user.user.id,
      clinicId,
      body.userIds,
      requestIdOf(req),
    );
    const members = await this.chatService.activeParticipantIds(conversationId);
    this.gateway.notifyConversationChanged(conversationId, { memberIds: added, kind: 'new' });
    this.gateway.notifyConversationChanged(conversationId, {
      memberIds: members.filter((id) => !added.includes(id) && id !== req.user.user.id),
      kind: 'updated',
    });
    return conversation;
  }

  @Patch('conversations/:conversationId')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.CHAT_SEND)
  async rename(
    @Param('clinicId') clinicId: string,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Body() body: RenameConversationDto,
    @Request() req: ChatRequest,
  ) {
    const conversation = await this.chatService.renameConversation(
      conversationId,
      req.user.user.id,
      clinicId,
      body.title,
      requestIdOf(req),
    );
    this.gateway.notifyConversationChanged(conversationId, {
      memberIds: (await this.chatService.activeParticipantIds(conversationId)).filter(
        (id) => id !== req.user.user.id,
      ),
      kind: 'updated',
    });
    return conversation;
  }

  @Post('conversations/:conversationId/leave')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.CHAT_READ)
  async leave(
    @Param('clinicId') clinicId: string,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Request() req: ChatRequest,
  ) {
    await this.chatService.leaveConversation(
      conversationId,
      req.user.user.id,
      clinicId,
      requestIdOf(req),
    );
    this.gateway.notifyConversationChanged(conversationId, {
      memberIds: await this.chatService.activeParticipantIds(conversationId),
      removedIds: [req.user.user.id],
      kind: 'updated',
    });
    return { conversationId, left: true };
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
    @Param('clinicId') clinicId: string,
    @Param('conversationId') conversationId: string,
    @Request() req: { user: ReqUserWithRoles },
  ) {
    return this.chatService.markConversationRead(conversationId, req.user.user.id, clinicId);
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
