import { IsUUID } from 'class-validator';

export class CreateEncounterDto {
  @IsUUID()
  clinicId!: string;

  @IsUUID()
  patientId!: string;

  @IsUUID()
  createdByUserId!: string;
}
