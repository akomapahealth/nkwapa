import { IsIn, IsOptional, IsUUID, Matches } from 'class-validator';

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

  /**
   * The fingerprint the preview returned.
   *
   * Optional so an existing caller keeps working, but the web client always sends it: without it
   * an operator can commit a merge against a panel that a concurrent edit, portal claim or
   * competing merge has already made untrue, which is the window a preview otherwise widens
   * rather than closes.
   */
  @IsOptional()
  @Matches(/^[0-9a-f]{16}$/)
  previewFingerprint?: string;
}
