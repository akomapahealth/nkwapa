/**
 * DI token for the resolved Keycloak admin configuration.
 *
 * A token rather than a defaulted constructor argument, for the reason spelled out on
 * EMAIL_CONFIG: Nest treats every constructor parameter as an injection site regardless of
 * its default, so `constructor(config = resolveKeycloakAdminConfig())` resolves to null at
 * boot while unit tests that construct the class directly keep passing.
 */
export const KEYCLOAK_ADMIN_CONFIG = 'KeycloakAdminConfig';
