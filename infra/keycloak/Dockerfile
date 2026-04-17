FROM quay.io/keycloak/keycloak:25.0 AS builder

ENV KC_DB=postgres
ENV KC_HEALTH_ENABLED=true
ENV KC_METRICS_ENABLED=true

WORKDIR /opt/keycloak

COPY infra/nkwapa/keycloak/realm-export /opt/keycloak/data/import
COPY infra/nkwapa/keycloak/themes/nkwapa /opt/keycloak/themes/nkwapa

RUN /opt/keycloak/bin/kc.sh build

FROM quay.io/keycloak/keycloak:25.0

ENV KC_DB=postgres
ENV KC_HEALTH_ENABLED=true
ENV KC_METRICS_ENABLED=true

COPY --from=builder /opt/keycloak/ /opt/keycloak/

EXPOSE 8080

ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
