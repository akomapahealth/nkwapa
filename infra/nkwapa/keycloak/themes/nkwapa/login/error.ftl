<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=false; section>
    <#if section = "header">
        recovery link needs attention
    <#elseif section = "form">
        <div class="alert-error" style="margin-bottom: 1.5rem;">
            <p style="font-family: 'Circular Std', 'Poppins', sans-serif; font-size: 0.875rem; color: #DC2626; margin: 0;">
                ${kcSanitize(message.summary)?no_esc}
            </p>
        </div>

        <#if skipLink??>
        <#else>
            <div class="nkwapa-action-stack">
                <#if realm.resetPasswordAllowed && url.loginResetCredentialsUrl??>
                    <a class="nkwapa-btn-primary nkwapa-btn-primary--link" href="${url.loginResetCredentialsUrl}">
                        Request a new reset link
                    </a>
                </#if>
                <a class="nkwapa-secondary-link" href="${url.loginUrl}">
                    Back to sign in
                </a>
                <#if client?? && client.baseUrl?has_content>
                    <a class="nkwapa-secondary-link" href="${client.baseUrl}">
                        Back to application
                    </a>
                </#if>
            </div>
        </#if>
    </#if>
</@layout.registrationLayout>
