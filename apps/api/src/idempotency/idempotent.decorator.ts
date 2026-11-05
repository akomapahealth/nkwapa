import { SetMetadata } from '@nestjs/common';

export const IDEMPOTENT_KEY = 'nkwapa:idempotent';

/**
 * Honour an `Idempotency-Key` header on this write (#307): a repeat of the key gets the first
 * response back instead of a second record. Put it on writes where a duplicate is costly, such
 * as a check-in, an appointment, an invitation or a clinical save.
 */
export const Idempotent = () => SetMetadata(IDEMPOTENT_KEY, true);
