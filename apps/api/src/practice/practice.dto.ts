import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export const PRACTICE_COUNT_MIN = 1;
export const PRACTICE_COUNT_MAX = 20;

export class AddPracticePatientsDto {
  @IsInt()
  @Min(PRACTICE_COUNT_MIN)
  @Max(PRACTICE_COUNT_MAX)
  count!: number;

  /** Put them all in the first station's queue at once. */
  @IsOptional()
  @IsBoolean()
  checkIn?: boolean;
}
