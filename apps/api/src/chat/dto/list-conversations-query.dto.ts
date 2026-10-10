import { IsOptional, IsInt, Min, Max } from 'class-validator';

export class ListConversationsQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 30;
}
