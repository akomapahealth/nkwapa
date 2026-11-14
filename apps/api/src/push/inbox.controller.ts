import { Body, Controller, Get, HttpCode, Post, Query, Request, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDate, IsOptional, IsUUID } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { ReqUser } from '../auth/auth.controller';
import { RateLimit } from '../common/rate-limit.decorator';
import { InboxService } from './inbox.service';

export class ListInboxQueryDto {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  before?: Date;
}

export class MarkInboxReadDto {
  /** Omitted means every unread notification. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  ids?: string[];
}

/** The signed-in person's notifications: the bell and its page. */
@Controller('me/notifications')
@UseGuards(JwtAuthGuard)
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  @Get()
  list(@Request() req: { user: ReqUser }, @Query() query: ListInboxQueryDto) {
    return this.inbox.list(req.user, query.before);
  }

  @Get('unread-count')
  async unreadCount(@Request() req: { user: ReqUser }) {
    return { unreadCount: await this.inbox.unreadCount(req.user) };
  }

  @Post('read')
  @HttpCode(200)
  @RateLimit({ key: 'me_notifications_read', limit: 60, windowSeconds: 60, scope: 'user-or-ip' })
  async markRead(@Request() req: { user: ReqUser }, @Body() dto: MarkInboxReadDto) {
    return { updated: await this.inbox.markRead(req.user, dto.ids) };
  }
}
