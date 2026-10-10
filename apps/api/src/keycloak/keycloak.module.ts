import { Module } from '@nestjs/common';
import { resolveKeycloakAdminConfig } from './keycloak-admin.config';
import { KeycloakAdminClient } from './keycloak-admin.client';
import { KeycloakAdminService } from './keycloak-admin.service';
import { KEYCLOAK_ADMIN_CONFIG } from './keycloak-admin.token';

/**
 * Resolved once at startup and shared, so the provisioning path and anything that reports
 * readiness to staff cannot disagree about what the deployment is configured to do.
 */
@Module({
  providers: [
    { provide: KEYCLOAK_ADMIN_CONFIG, useFactory: () => resolveKeycloakAdminConfig() },
    KeycloakAdminClient,
    KeycloakAdminService,
  ],
  exports: [KeycloakAdminService, KEYCLOAK_ADMIN_CONFIG],
})
export class KeycloakModule {}
