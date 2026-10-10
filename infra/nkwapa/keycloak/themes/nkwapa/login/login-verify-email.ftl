<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=true; section>
    <#if section = "header">
        verify your email
    <#elseif section = "form">
        <div class="nkwapa-status-copy">
            <p>
                <#if user?? && user.email??>
                    ${kcSanitize(msg("emailVerifyInstruction1", user.email))?no_esc}
                <#else>
                    ${kcSanitize(msg("emailVerifyInstruction1", ""))?no_esc}
                </#if>
            </p>
            <p>${kcSanitize(msg("emailVerifyInstruction2"))?no_esc}</p>
        </div>

        <div class="nkwapa-action-stack">
            <a class="nkwapa-btn-primary nkwapa-btn-primary--link" href="${url.loginAction}">
                Resend verification email
            </a>
            <p class="nkwapa-helper-text">Use this if the verification message did not arrive.</p>
            <a class="nkwapa-secondary-link" href="${url.loginUrl}">
                ${kcSanitize(msg("backToLogin"))?no_esc}
            </a>
        </div>
    </#if>
</@layout.registrationLayout>
