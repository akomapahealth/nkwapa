<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=false; section>
    <#if section = "header">
        something went wrong
    <#elseif section = "form">
        <div class="alert-error" style="margin-bottom: 1.5rem;">
            <p style="font-family: 'Circular Std', 'Poppins', sans-serif; font-size: 0.875rem; color: #DC2626; margin: 0;">
                ${kcSanitize(message.summary)?no_esc}
            </p>
        </div>

        <#if skipLink??>
        <#else>
            <#if client?? && client.baseUrl?has_content>
                <div class="nkwapa-register-link">
                    <a href="${client.baseUrl}">Back to application</a>
                </div>
            </#if>
        </#if>
    </#if>
</@layout.registrationLayout>
