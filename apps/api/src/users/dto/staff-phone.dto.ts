import { IsOptional, IsString, MaxLength } from 'class-validator';

/** A staff member's own work phone. Null or blank clears it. */
export class UpdateStaffPhoneDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string | null;
}
