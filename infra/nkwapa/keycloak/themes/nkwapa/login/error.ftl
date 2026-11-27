<#import "template.ftl" as layout>
<#-- Links from an email often reach this page with no client. Keycloak then builds the reset
     link for its own "account" client, whose redirect fails behind the proxy ("Invalid parameter:
     redirect_uri") and would land the person in Keycloak's account console. Name Nkwapa's client,
     and send "Back to sign in" through Nkwapa so a sign-in starts with a real redirect. -->
<#assign appUrl = (properties.nkwapaWebOrigins!'')?split(",")[0]?trim?remove_ending("/") />
<#assign resetUrl = (client??)?then(url.loginResetCredentialsUrl, url.loginResetCredentialsUrl + url.loginResetCredentialsUrl?contains("?")?then("&", "?") + "client_id=nkwapa-web") />
<@layout.registrationLayout displayMessage=true; section>
    <#if section = "header">
        This link needs attention
    <#elseif section = "form">
        <#if skipLink??>
        <#else>
            <div class="nkwapa-action-stack">
                <#if realm.resetPasswordAllowed && url.loginResetCredentialsUrl??>
                    <a class="nkwapa-btn-primary nkwapa-btn-primary--link" href="${resetUrl}">
                        Email me a new password link
                    </a>
                </#if>
                <a class="nkwapa-secondary-link" href="${appUrl?has_content?then(appUrl + "/login", url.loginUrl)}">
                    Back to sign in
                </a>
            </div>
        </#if>
    </#if>
</@layout.registrationLayout>
