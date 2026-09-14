import { Inject, Injectable, Logger } from '@nestjs/common';
import { redactLogValue } from '../common/redaction';
import type { KeycloakAdminConfig } from './keycloak-admin.config';
import { KEYCLOAK_ADMIN_CONFIG } from './keycloak-admin.token';

export type KeycloakRequiredAction = 'UPDATE_PASSWORD' | 'VERIFY_EMAIL';

export interface KeycloakUser {
  id: string;
  username?: string;
  email?: string;
  enabled?: boolean;
  emailVerified?: boolean;
}

export interface CreateKeycloakUserInput {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  requiredActions: KeycloakRequiredAction[];
}

export interface ExecuteActionsEmailInput {
  userId: string;
  actions: KeycloakRequiredAction[];
  /** Where Keycloak returns the patient once every action is complete. */
  redirectUri: string;
  /** The public client the redirect is validated against. */
  clientId: string;
  lifespanSeconds: number;
}

export type KeycloakAdminErrorCode =
  | 'KEYCLOAK_ADMIN_UNCONFIGURED'
  | 'KEYCLOAK_ADMIN_AUTH_FAILED'
  | 'KEYCLOAK_ADMIN_TIMEOUT'
  | 'KEYCLOAK_ADMIN_UNREACHABLE'
  | 'KEYCLOAK_ADMIN_REQUEST_FAILED';

/**
 * Carries a code rather than a message worth showing anyone.
 *
 * The message is for logs, and logs are read by people who are not the patient, so it must
 * never carry the address being provisioned or any part of the service-account secret.
 */
export class KeycloakAdminError extends Error {
  constructor(
    readonly code: KeycloakAdminErrorCode,
    readonly status?: number,
  ) {
    super(status === undefined ? code : `${code} (${status})`);
    this.name = 'KeycloakAdminError';
  }
}

/** Refresh a little before expiry, so a token never dies mid-request. */
const TOKEN_EXPIRY_MARGIN_SECONDS = 30;

/**
 * The only Admin-REST caller in application code.
 *
 * It authenticates as the nkwapa-api service account, which holds manage-users and nothing
 * else, so the blast radius of a leaked token is bounded by the realm configuration rather
 * than by the care taken here. What is taken care of here is the secret itself: it is sent
 * only in a form body to the token endpoint, and appears in no log line, no thrown message
 * and no error surfaced to a caller.
 */
@Injectable()
export class KeycloakAdminClient {
  private readonly logger = new Logger(KeycloakAdminClient.name);
  private cachedToken: { value: string; expiresAt: number } | null = null;

  constructor(@Inject(KEYCLOAK_ADMIN_CONFIG) private readonly config: KeycloakAdminConfig) {}

  get isReady(): boolean {
    return this.config.readiness === 'ready';
  }

  async findUserByEmail(email: string): Promise<KeycloakUser | null> {
    const query = new URLSearchParams({ email, exact: 'true' });
    const users = await this.request<KeycloakUser[]>('GET', `/users?${query.toString()}`);
    if (!Array.isArray(users) || users.length === 0) return null;
    // exact=true still matches case-insensitively, which is what we want; the explicit
    // comparison is here so a future Keycloak that loosens the filter cannot widen it.
    const target = email.toLowerCase();
    return users.find((user) => (user.email ?? '').toLowerCase() === target) ?? null;
  }

  /**
   * Create the identity, tolerating the 409 that a concurrent invite would produce.
   *
   * Two staff members inviting the same patient at the same moment is an ordinary race,
   * not an error: whoever loses re-reads and carries on with the row that now exists.
   */
  async createUser(input: CreateKeycloakUserInput): Promise<KeycloakUser> {
    const response = await this.send('POST', '/users', {
      username: input.email,
      email: input.email,
      enabled: true,
      // The action email verifies the address. Asserting it here instead would hand a
      // verified identity to anyone who could get an address typed into the invite form.
      emailVerified: false,
      ...(input.firstName ? { firstName: input.firstName } : {}),
      ...(input.lastName ? { lastName: input.lastName } : {}),
      // Belt and braces for a lost email: signing in still forces setup to complete.
      requiredActions: input.requiredActions,
    });

    if (response.status !== 409 && !response.ok) {
      await this.fail(response, 'POST /users');
    }

    const created = await this.findUserByEmail(input.email);
    if (!created) {
      throw new KeycloakAdminError('KEYCLOAK_ADMIN_REQUEST_FAILED', response.status);
    }
    return created;
  }

  /**
   * Whether the patient has already chosen a password.
   *
   * This is the signal that makes a resend idempotent. Resending an invite must never
   * reset a credential the patient already set, and Keycloak's own state is the only
   * honest source for that -- a local flag would drift the moment anyone used the
   * forgot-password flow.
   */
  async hasPasswordCredential(userId: string): Promise<boolean> {
    const credentials = await this.request<Array<{ type?: string }>>(
      'GET',
      `/users/${encodeURIComponent(userId)}/credentials`,
    );
    return Array.isArray(credentials) && credentials.some((entry) => entry.type === 'password');
  }

  async executeActionsEmail(input: ExecuteActionsEmailInput): Promise<void> {
    const query = new URLSearchParams({
      client_id: input.clientId,
      redirect_uri: input.redirectUri,
      lifespan: String(input.lifespanSeconds),
    });
    const response = await this.send(
      'PUT',
      `/users/${encodeURIComponent(input.userId)}/execute-actions-email?${query.toString()}`,
      input.actions,
    );
    if (!response.ok) {
      await this.fail(response, 'PUT /execute-actions-email');
    }
  }

  private async request<T>(method: 'GET', endpoint: string): Promise<T> {
    const response = await this.send(method, endpoint);
    if (!response.ok) {
      await this.fail(response, `${method} ${endpoint.split('?')[0]}`);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  /**
   * One retry, and only on a 401.
   *
   * Keycloak restarting, or the service account's session being revoked, invalidates a
   * cached token that has not yet reached its stated expiry. Left alone that fails an
   * invite for a reason the clinic can do nothing about, so the token is dropped and the
   * call repeated exactly once -- never more, so a genuinely rejected credential surfaces
   * as a failure instead of a loop.
   */
  private async send(
    method: 'GET' | 'POST' | 'PUT',
    endpoint: string,
    body?: unknown,
  ): Promise<Response> {
    const response = await this.dispatch(method, endpoint, body);
    if (response.status !== 401) return response;

    this.cachedToken = null;
    return this.dispatch(method, endpoint, body);
  }

  private async dispatch(
    method: 'GET' | 'POST' | 'PUT',
    endpoint: string,
    body?: unknown,
  ): Promise<Response> {
    const { baseUrl, realm } = this.assertReady();
    const token = await this.accessToken();

    return this.fetchWithTimeout(`${baseUrl}/admin/realms/${realm}${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  private async accessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt > now) {
      return this.cachedToken.value;
    }

    const { baseUrl, realm, clientId, clientSecret } = this.assertReady();
    const response = await this.fetchWithTimeout(
      `${baseUrl}/realms/${realm}/protocol/openid-connect/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
        }).toString(),
      },
    );

    if (!response.ok) {
      // Deliberately not routed through fail(): a token-endpoint body can echo the client
      // id and grant details, and none of that belongs in a log beside a status code.
      this.logger.warn(
        JSON.stringify({
          message: 'Keycloak service-account authentication failed',
          status: response.status,
        }),
      );
      throw new KeycloakAdminError('KEYCLOAK_ADMIN_AUTH_FAILED', response.status);
    }

    const payload = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!payload.access_token) {
      throw new KeycloakAdminError('KEYCLOAK_ADMIN_AUTH_FAILED', response.status);
    }

    const lifetime = Math.max(0, (payload.expires_in ?? 60) - TOKEN_EXPIRY_MARGIN_SECONDS);
    this.cachedToken = { value: payload.access_token, expiresAt: now + lifetime * 1000 };
    return this.cachedToken.value;
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(this.config.timeoutMs) });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      throw new KeycloakAdminError(
        timedOut ? 'KEYCLOAK_ADMIN_TIMEOUT' : 'KEYCLOAK_ADMIN_UNREACHABLE',
      );
    }
  }

  /**
   * Strip the service-account secret before anything is logged.
   *
   * redactLogValue knows about bearer tokens, connection strings and contact details, but it
   * cannot know a value that only this deployment holds. An upstream that echoes a request
   * back would otherwise put the credential straight into the log, so it is removed by
   * identity first and pattern-matched afterwards.
   */
  private withoutSecret(value: string): string {
    const secret = this.config.clientSecret;
    if (!secret || secret.length === 0) return value;
    return value.split(secret).join('[redacted-secret]');
  }

  private assertReady(): {
    baseUrl: string;
    realm: string;
    clientId: string;
    clientSecret: string;
  } {
    const { baseUrl, realm, clientId, clientSecret } = this.config;
    if (this.config.readiness !== 'ready' || !baseUrl || !clientSecret) {
      throw new KeycloakAdminError('KEYCLOAK_ADMIN_UNCONFIGURED');
    }
    return { baseUrl, realm, clientId, clientSecret };
  }

  private async fail(response: Response, endpoint: string): Promise<never> {
    const detail = await response.text().catch(() => '');
    this.logger.warn(
      JSON.stringify({
        message: 'Keycloak admin request failed',
        status: response.status,
        endpoint,
        error: redactLogValue(this.withoutSecret(detail)),
      }),
    );
    throw new KeycloakAdminError('KEYCLOAK_ADMIN_REQUEST_FAILED', response.status);
  }
}
