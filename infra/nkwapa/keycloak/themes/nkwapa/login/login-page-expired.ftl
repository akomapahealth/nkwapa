<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=true; section>
    <#if section = "header">
        ${msg("pageExpiredTitle")}
    <#elseif section = "form">
        <div class="nkwapa-status-copy">
            <p>
                ${kcSanitize(msg("pageExpiredMsg1"))?no_esc}
                <a id="loginRestartLink" class="nkwapa-inline-link" href="${url.loginRestartFlowUrl}">
                    ${kcSanitize(msg("doClickHere"))?no_esc}
                </a>.
            </p>
            <p>
                ${kcSanitize(msg("pageExpiredMsg2"))?no_esc}
                <a id="loginContinueLink" class="nkwapa-inline-link" href="${url.loginAction}">
                    ${kcSanitize(msg("doClickHere"))?no_esc}
                </a>.
            </p>
        </div>

        <div class="nkwapa-action-stack">
            <a class="nkwapa-secondary-link" href="${url.loginUrl}">
                ${kcSanitize(msg("backToLogin"))?no_esc}
            </a>
        </div>
    </#if>
</@layout.registrationLayout>
