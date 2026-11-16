import { IsOptional } from 'class-validator';
import {
  IsMiddleName,
  MiddleInitialAlias,
  IsStaffNamePart,
  ToMiddleName,
  ToStaffNamePart,
} from '../../common/staff-name.validation';

/** A staff member's name, as they or an admin entered it (#225). */
export class UpdateStaffNameDto {
  @ToStaffNamePart()
  @IsStaffNamePart()
  firstName!: string;

  @ToMiddleName()
  @IsOptional()
  @IsMiddleName()
  middleName?: string | null;

  /** @deprecated Pre-#342 clients; read into `middleName`. Remove next release. */
  @MiddleInitialAlias()
  middleInitial?: unknown;

  @ToStaffNamePart()
  @IsStaffNamePart()
  lastName!: string;
}
