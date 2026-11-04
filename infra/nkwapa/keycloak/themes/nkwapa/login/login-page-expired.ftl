<#import "template.ftl" as layout>
<#-- Keycloak's own copy here is "To restart the login process, click here." twice over. Both
     links keep their ids and targets; they are worded as the two choices they are. -->
<@layout.registrationLayout displayMessage=true journey="help" eyebrow="Sign-in paused"; section>
    <#if section = "header">
        ${msg("pageExpiredTitle")}
    <#elseif section = "form">
        <div class="nkwapa-status-copy">
            <p>${msg("pageExpiredExplanation")}</p>
        </div>

        <div class="nkwapa-action-stack">
            <a id="loginRestartLink" class="nkwapa-btn-primary nkwapa-btn-primary--link" href="${url.loginRestartFlowUrl}">
                ${msg("pageExpiredRestart")}
            </a>
            <a id="loginContinueLink" class="nkwapa-secondary-link" href="${url.loginAction}">
                ${msg("pageExpiredContinue")}
            </a>
        </div>
    </#if>
</@layout.registrationLayout>
