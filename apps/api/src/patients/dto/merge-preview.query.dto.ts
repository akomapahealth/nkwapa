import { IsIn, IsOptional, IsUUID } from 'class-validator';

/**
 * Which duplicate to preview against, and under which strategies.
 *
 * The strategies are query parameters rather than a body because the preview is a GET: it writes
 * nothing, and an operator flipping between "keep this chart's app account" and "keep the other
 * one's" is asking a different read, not performing an action.
 */
export class MergePreviewQueryDto {
  @IsUUID()
  sourcePatientId!: string;

  @IsOptional()
  @IsIn(['CANONICAL', 'SOURCE'])
  portalLinkStrategy?: 'CANONICAL' | 'SOURCE';

  @IsOptional()
  @IsIn(['CANONICAL', 'SOURCE', 'MERGE'])
  inviteStrategy?: 'CANONICAL' | 'SOURCE' | 'MERGE';
}

/** The admin twin, which names both charts because it is not scoped to one already. */
export class AdminMergePreviewQueryDto extends MergePreviewQueryDto {
  @IsUUID()
  canonicalPatientId!: string;
}
