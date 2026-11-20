<#import "template.ftl" as layout>
<#-- Shown after an invitation and after a password reset alike; Keycloak does not say which. -->
<#assign appUrl = (properties.nkwapaWebOrigins!'')?split(",")[0]?trim?remove_ending("/") />
<@layout.registrationLayout displayMessage=false journey="setup" step=(requiredActions??)?then(2, 3) eyebrow="Your password"; section>
    <#if section = "header">
        <#-- messageHeader is a message KEY, not a sentence. Printing it directly put the
             literal text "accountUpdatedTitle" in front of every patient who finished
             setting their password, which is the last screen of the account-setup journey. -->
        <#if messageHeader??>
            ${kcSanitize(msg("${messageHeader}"))?no_esc}
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
                <#elseif appUrl?has_content>
                    <#-- Through Nkwapa, not url.loginUrl: that sign-in has no redirect to return to. -->
                    <a class="nkwapa-btn-primary nkwapa-btn-primary--link" href="${appUrl}/login">
                        ${kcSanitize(msg("nkwapaSignIn"))?no_esc}
                    </a>
                <#elseif client?? && client.baseUrl?has_content>
                    <a class="nkwapa-btn-primary nkwapa-btn-primary--link" href="${client.baseUrl}">
                        ${kcSanitize(msg("backToApplication"))?no_esc}
                    </a>
                </#if>
            </div>
        </#if>
    </#if>
</@layout.registrationLayout>
