<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=false; section>
    <#if section = "header">
        <#if messageHeader??>
            ${kcSanitize(messageHeader)?no_esc}
        <#elseif message?has_content>
            ${kcSanitize(message.summary)?no_esc}
        <#else>
            ${msg("infoTitle")}
        </#if>
    <#elseif section = "form">
        <#if message?has_content>
            <div class="nkwapa-alert nkwapa-alert--${message.type!'info'}" role="status">
                ${kcSanitize(message.summary)?no_esc}
            </div>
        </#if>

        <#if requiredActions??>
            <ul class="nkwapa-status-list">
                <#list requiredActions as requiredAction>
                    <li>${kcSanitize(msg("requiredAction.${requiredAction}"))?no_esc}</li>
                </#list>
            </ul>
        </#if>

        <#if skipLink??>
        <#else>
            <div class="nkwapa-action-stack">
                <#if (pageRedirectUri!'')?has_content>
                    <a class="nkwapa-btn-primary nkwapa-btn-primary--link" href="${pageRedirectUri}">
                        ${kcSanitize(msg("backToApplication"))?no_esc}
                    </a>
                <#elseif (actionUri!'')?has_content>
                    <a class="nkwapa-btn-primary nkwapa-btn-primary--link" href="${actionUri}">
                        <#if actionUriTitle??>${kcSanitize(actionUriTitle)?no_esc}<#else>${kcSanitize(msg("doContinue"))?no_esc}</#if>
                    </a>
                <#elseif client?? && client.baseUrl?has_content>
                    <a class="nkwapa-btn-primary nkwapa-btn-primary--link" href="${client.baseUrl}">
                        ${kcSanitize(msg("backToApplication"))?no_esc}
                    </a>
                </#if>

                <#if url.loginUrl??>
                    <a class="nkwapa-secondary-link" href="${url.loginUrl}">
                        ${kcSanitize(msg("backToLogin"))?no_esc}
                    </a>
                </#if>
            </div>
        </#if>
    </#if>
</@layout.registrationLayout>
