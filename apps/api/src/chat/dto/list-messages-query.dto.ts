import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';

export class ListMessagesQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;
}
