import { Inject, Injectable, Logger } from '@nestjs/common';
import type { KeycloakAdminConfig } from './keycloak-admin.config';
import { KEYCLOAK_ADMIN_CONFIG } from './keycloak-admin.token';
import {
  KeycloakAdminClient,
  KeycloakAdminError,
  type KeycloakRequiredAction,
} from './keycloak-admin.client';

/**
 * What happened to the invitee's identity when an invite was sent.
 *
 * Mirrors PortalInviteIdentityStatus in the schema, which both patient and staff invitations
 * record. Whoever sent the invite reads these, so each value has to answer "can this person
 * act on the email I just sent?" on its own.
 */
export type InvitedIdentityOutcome =
  | 'PROVISIONED'
  | 'EXISTING_PENDING'
  | 'ALREADY_ACTIVE'
  | 'SKIPPED'
  | 'FAILED';

export interface ProvisionInvitedIdentityInput {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  /** Where Keycloak returns the patient once setup is complete. */
  claimRedirectUri: string;
  /** Tied to the invite's own expiry, so link and invitation die together. */
  lifespanSeconds: number;
}

export interface ProvisionInvitedIdentityResult {
  outcome: InvitedIdentityOutcome;
  keycloakUserId: string | null;
  actionsSent: KeycloakRequiredAction[];
  /** A stable code, never a sentence and never anything patient-identifying. */
  failureReason: string | null;
}

@Injectable()
export class KeycloakAdminService {
  private readonly logger = new Logger(KeycloakAdminService.name);

  constructor(
    private readonly client: KeycloakAdminClient,
    @Inject(KEYCLOAK_ADMIN_CONFIG) private readonly config: KeycloakAdminConfig,
  ) {}

  get isReady(): boolean {
    return this.client.isReady;
  }

  /**
   * Make sure the invited address can sign in, and send it whatever setup it still needs.
   *
   * Every decision is taken from Keycloak's own state rather than from anything stored
   * locally, which is what makes a resend idempotent:
   *
   *   - no identity        -> create it, ask for a password and email verification
   *   - no password yet    -> ask for a password (and verification, if still outstanding)
   *   - password chosen    -> never ask again; that would reset a credential the patient
   *                           picked, which is the one thing a resend must not do
   *   - password + verified-> send nothing; they already have a working account
   *
   * Nothing here throws. A clinic must be able to invite a patient while Keycloak is down;
   * the invite still exists, the chart says the account could not be created, and a resend
   * finishes the job later.
   */
  async provisionInvitedIdentity(
    input: ProvisionInvitedIdentityInput,
  ): Promise<ProvisionInvitedIdentityResult> {
    if (!this.client.isReady) {
      return this.result('SKIPPED', null, [], 'KEYCLOAK_ADMIN_UNCONFIGURED');
    }

    try {
      const existing = await this.client.findUserByEmail(input.email);

      if (!existing) {
        const actions: KeycloakRequiredAction[] = ['UPDATE_PASSWORD', 'VERIFY_EMAIL'];
        const created = await this.client.createUser({
          email: input.email,
          firstName: input.firstName ?? null,
          lastName: input.lastName ?? null,
          requiredActions: actions,
        });
        await this.sendActions(created.id, actions, input);
        return this.result('PROVISIONED', created.id, actions);
      }

      // A disabled identity is a decision someone took deliberately. Re-enabling it from an
      // invite would quietly undo that, so it is reported instead.
      if (existing.enabled === false) {
        return this.result('FAILED', existing.id, [], 'IDENTITY_DISABLED');
      }

      const hasPassword = await this.client.hasPasswordCredential(existing.id);
      const emailVerified = existing.emailVerified === true;

      if (hasPassword && emailVerified) {
        return this.result('ALREADY_ACTIVE', existing.id, []);
      }

      const actions: KeycloakRequiredAction[] = [
        ...(hasPassword ? [] : (['UPDATE_PASSWORD'] as const)),
        ...(emailVerified ? [] : (['VERIFY_EMAIL'] as const)),
      ];
      await this.sendActions(existing.id, actions, input);
      return this.result('EXISTING_PENDING', existing.id, actions);
    } catch (error) {
      const code =
        error instanceof KeycloakAdminError ? error.code : 'KEYCLOAK_ADMIN_REQUEST_FAILED';
      this.logger.warn(
        JSON.stringify({ message: 'Patient identity provisioning failed', reason: code }),
      );
      return this.result('FAILED', null, [], code);
    }
  }

  private async sendActions(
    userId: string,
    actions: KeycloakRequiredAction[],
    input: ProvisionInvitedIdentityInput,
  ): Promise<void> {
    if (actions.length === 0) return;
    await this.client.executeActionsEmail({
      userId,
      actions,
      redirectUri: input.claimRedirectUri,
      clientId: this.config.publicClientId,
      lifespanSeconds: input.lifespanSeconds,
    });
  }

  private result(
    outcome: InvitedIdentityOutcome,
    keycloakUserId: string | null,
    actionsSent: KeycloakRequiredAction[],
    failureReason: string | null = null,
  ): ProvisionInvitedIdentityResult {
    return { outcome, keycloakUserId, actionsSent, failureReason };
  }
}
