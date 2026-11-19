import { Type } from 'class-transformer';
import { Equals, IsInt, IsString, MaxLength, Min, MinLength } from 'class-validator';

/** A signature on the staff confidentiality agreement (#330). */
export class SignStaffAgreementDto {
  /** The version the person was shown, so a stale tab cannot sign text it never displayed. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(250)
  signedName!: string;

  @Equals(true, { message: 'Tick the box to confirm you have read and agree.' })
  agreed!: boolean;
}
