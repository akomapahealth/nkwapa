import { IsOptional, Matches } from 'class-validator';
import { ListDuplicateCandidatesQueryDto } from './list-duplicate-candidates.query.dto';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/** The queue's filters, plus the clinic pair a burden row narrows the list to. */
export class CrossClinicInvestigationQueryDto extends ListDuplicateCandidatesQueryDto {
  @IsOptional()
  @Matches(new RegExp(`^${UUID}:${UUID}$`, 'i'), {
    message: 'clinicPair must be two clinic ids joined by a colon',
  })
  clinicPair?: string;
}
