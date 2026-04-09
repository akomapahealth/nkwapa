import { IsUUID } from 'class-validator';

export class CreateConversationDto {
  @IsUUID()
  participantUserId!: string;
}
