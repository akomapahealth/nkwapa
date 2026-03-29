import { IsUUID } from 'class-validator';

export class LinkPortalDto {
  @IsUUID()
  userId!: string;
}
