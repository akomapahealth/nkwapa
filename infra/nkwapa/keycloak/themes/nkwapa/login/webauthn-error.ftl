<#import "template.ftl" as layout>
<#--
  Where a passkey attempt lands when the device window is closed, times out or refuses. The
  retry form and its hidden fields are Keycloak's contract; keep them.
-->
<@layout.registrationLayout
    description="Nothing has changed. This usually means the device window was closed or took too long.";
    section>
    <#if section = "header">
        That did not work
    <#elseif section = "form">
        <form id="kc-error-credential-form" action="${url.loginAction}" method="post">
            <input type="hidden" id="executionValue" name="authenticationExecution" value="${execution}"/>
            <input type="hidden" id="isSetRetry" name="isSetRetry" value="retry"/>
        </form>

        <div class="nkwapa-action-stack">
            <button type="submit" form="kc-error-credential-form" id="kc-try-again" name="try-again" class="nkwapa-btn-primary" autofocus>${msg("doTryAgain")}</button>
            <#if isAppInitiatedAction??>
                <form action="${url.loginAction}" id="kc-webauthn-settings-form" method="post">
                    <button type="submit" id="cancelWebAuthnAIA" name="cancel-aia" value="true" class="nkwapa-btn-secondary">Cancel</button>
                </form>
            </#if>
        </div>
    </#if>
</@layout.registrationLayout>
