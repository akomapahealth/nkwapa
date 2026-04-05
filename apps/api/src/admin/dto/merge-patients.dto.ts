import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class MergePatientsDto {
  @IsUUID()
  canonicalPatientId!: string;

  @IsUUID()
  sourcePatientId!: string;

  @IsOptional()
  @IsIn(['CANONICAL', 'SOURCE'])
  portalLinkStrategy?: 'CANONICAL' | 'SOURCE';

  @IsOptional()
  @IsIn(['CANONICAL', 'SOURCE', 'MERGE'])
  inviteStrategy?: 'CANONICAL' | 'SOURCE' | 'MERGE';
}
