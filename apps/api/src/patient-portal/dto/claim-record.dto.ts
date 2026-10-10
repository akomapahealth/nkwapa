import { IsDateString, IsString, IsUUID, MaxLength } from 'class-validator';
import { ToSanitizedString } from '../../common/validation';

export class ClaimPatientRecordDto {
  @IsUUID()
  inviteId!: string;

  @ToSanitizedString({ maxLength: 32 })
  @IsString()
  @MaxLength(32)
  patientCode!: string;

  @IsDateString()
  dob!: string;
}
