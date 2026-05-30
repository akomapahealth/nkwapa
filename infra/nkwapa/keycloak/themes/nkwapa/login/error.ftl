<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=true; section>
    <#if section = "header">
        sign-in link needs attention
    <#elseif section = "form">
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
