import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import {
  IDENTITY_SYNC_QUEUE,
  IdentitySyncService,
  type IdentitySyncJobData,
} from './identity-sync.service';

/*
  Fast first, then patient: the first retry is usually the request that queued the job settling,
  or a Keycloak blip that has already passed; anything still failing after that is not a blip.
*/
const RETRY_DELAYS_MS = [3_000, 10_000, 30_000, 60_000, 120_000];

export function identitySyncBackoff(attemptsMade: number): number {
  return RETRY_DELAYS_MS[Math.min(Math.max(attemptsMade, 1), RETRY_DELAYS_MS.length) - 1];
}

@Processor(IDENTITY_SYNC_QUEUE, {
  concurrency: 2,
  settings: { backoffStrategy: identitySyncBackoff },
})
export class IdentitySyncProcessor extends WorkerHost {
  constructor(private readonly identitySyncService: IdentitySyncService) {
    super();
  }

  async process(job: Job<IdentitySyncJobData>): Promise<string> {
    return this.identitySyncService.processSync(job.data, {
      attemptsMade: job.attemptsMade ?? 0,
      maxAttempts: job.opts?.attempts ?? 1,
      jobId: job.id,
    });
  }
}
