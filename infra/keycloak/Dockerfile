FROM quay.io/keycloak/keycloak:26.6.2 AS builder

# Build-time option. Staging sets KC_METRICS_ENABLED=false (Render passes env vars as build args)
# to save memory on the 512 MB free tier; prod keeps the default.
ARG KC_METRICS_ENABLED=true

ENV KC_DB=postgres
ENV KC_HEALTH_ENABLED=true
ENV KC_METRICS_ENABLED=${KC_METRICS_ENABLED}

WORKDIR /opt/keycloak

COPY infra/nkwapa/keycloak/realm-export /opt/keycloak/data/import
COPY infra/nkwapa/keycloak/themes/nkwapa /opt/keycloak/themes/nkwapa

RUN /opt/keycloak/bin/kc.sh build

FROM quay.io/keycloak/keycloak:26.6.2

ARG KC_METRICS_ENABLED=true

ENV KC_DB=postgres
ENV KC_HEALTH_ENABLED=true
ENV KC_METRICS_ENABLED=${KC_METRICS_ENABLED}

COPY --from=builder /opt/keycloak/ /opt/keycloak/
# Applies KC_SMTP_* to the existing realm on every boot; --import-realm only does so once.
COPY infra/nkwapa/keycloak/entrypoint.sh /opt/keycloak/bin/nkwapa-entrypoint.sh

EXPOSE 8080

ENTRYPOINT ["/opt/keycloak/bin/nkwapa-entrypoint.sh"]
CMD ["start", "--optimized", "--import-realm"]
