import { IsString, IsOptional, IsEnum } from 'class-validator';
import { UserRole } from '@prisma/client';

export class AssignRoleDto {
  @IsOptional()
  @IsString()
  clinicId?: string | null;

  @IsEnum(UserRole)
  role!: UserRole;
}
