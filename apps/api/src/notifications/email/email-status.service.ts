import { Inject, Injectable, Optional } from '@nestjs/common';
import { EMAIL_CONFIG } from './email-provider.token';
import {
  describeEmailUnavailability,
  resolveEmailConfig,
  type EmailConfig,
  type EmailReadiness,
} from './email-config';

export interface EmailStatus {
  /** Whether a send can reach a real inbox. */
  available: boolean;
  readiness: EmailReadiness;
  provider: string;
  fromAddress: string | null;
  /** Environment variable names only. Never their values. */
  missingVars: string[];
  reason: string | null;
}

/**
 * Reports whether email works, for the health check and the operator banner.
 *
 * Everything here is safe to show a signed-in operator: variable names, never values,
 * and no host or credential. The from address is included because it is the one
 * setting staff need to recognise, and it already appears in every message sent.
 */
@Injectable()
export class EmailStatusService {
  private readonly config: EmailConfig;

  constructor(@Optional() @Inject(EMAIL_CONFIG) config?: EmailConfig) {
    // Optional so tests can construct the service with an explicit config, while the
    // module supplies the resolved one at runtime.
    this.config = config ?? resolveEmailConfig();
  }

  getStatus(): EmailStatus {
    const { provider, readiness, missing, fromAddress } = this.config;
    return {
      available: readiness !== 'unconfigured',
      readiness,
      provider,
      fromAddress,
      missingVars: missing,
      reason:
        describeEmailUnavailability(this.config) ??
        (readiness === 'fake'
          ? 'Email is running on the local fake provider, so messages are logged instead of sent.'
          : null),
    };
  }

  /** `configured` | `fake` | `not-configured`, for the unauthenticated health endpoint. */
  getHealthCheck(): string {
    if (this.config.readiness === 'smtp') return 'configured';
    return this.config.readiness === 'fake' ? 'fake' : 'not-configured';
  }
}
