import { IsOptional } from 'class-validator';
import {
  IsMiddleInitial,
  IsStaffNamePart,
  ToMiddleInitial,
  ToStaffNamePart,
} from '../../common/staff-name.validation';

/** A staff member's name, as they or an admin entered it (#225). */
export class UpdateStaffNameDto {
  @ToStaffNamePart()
  @IsStaffNamePart()
  firstName!: string;

  @ToMiddleInitial()
  @IsOptional()
  @IsMiddleInitial()
  middleInitial?: string | null;

  @ToStaffNamePart()
  @IsStaffNamePart()
  lastName!: string;
}
