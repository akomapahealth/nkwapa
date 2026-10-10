import { KeycloakAdminService } from '../keycloak/keycloak-admin.service';
import type { ProvisionInvitedIdentityResult } from '../keycloak/keycloak-admin.service';

export interface KeycloakAdminServiceMock {
  isReady: boolean;
  provisionInvitedIdentity: jest.Mock<Promise<ProvisionInvitedIdentityResult>>;
}

/**
 * The default is a successful first-time provision, because that is what every invite
 * specification that is not about identity assumes happened. Tests that care about the
 * other outcomes override the mock rather than restating the whole shape.
 */
export function provisionResult(
  overrides: Partial<ProvisionInvitedIdentityResult> = {},
): ProvisionInvitedIdentityResult {
  return {
    outcome: 'PROVISIONED',
    keycloakUserId: 'kc-provisioned-1',
    actionsSent: ['UPDATE_PASSWORD', 'VERIFY_EMAIL'],
    failureReason: null,
    ...overrides,
  };
}

export function createKeycloakAdminServiceMock(
  result: ProvisionInvitedIdentityResult = provisionResult(),
): KeycloakAdminServiceMock {
  return {
    isReady: true,
    provisionInvitedIdentity: jest.fn().mockResolvedValue(result),
  };
}

/**
 * One provider, shared by every specification that compiles PatientPortalService.
 *
 * Four files were each repeating the same stub; a fifth would have repeated it again, and
 * the next constructor argument would have broken all of them at once.
 */
export function keycloakAdminServiceProvider(mock = createKeycloakAdminServiceMock()) {
  return { provide: KeycloakAdminService, useValue: mock };
}
