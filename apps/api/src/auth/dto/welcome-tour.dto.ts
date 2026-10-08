import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

/** The welcome tour version the caller just finished or skipped. */
export class CompleteWelcomeTourDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  version!: number;
}
