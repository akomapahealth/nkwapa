import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ToSanitizedString } from '../../common/validation';

export class CreateGroupConversationDto {
  /** Optional; without one the group reads as its members' names. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @ToSanitizedString({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  title?: string | null;

  /** The other people, not including the creator. */
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(49)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  participantUserIds!: string[];
}

export class AddParticipantsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(49)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  userIds!: string[];
}

export class RenameConversationDto {
  @ValidateIf((_, value) => value !== null)
  @ToSanitizedString({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  title!: string | null;
}
