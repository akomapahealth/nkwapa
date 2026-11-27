<#import "template.ftl" as layout>
<#-- "Try another way": choose between the second steps this account has. Each option submits its
     execution id, Keycloak's contract. -->
<@layout.registrationLayout
    description="Choose how to confirm it is you.";
    section>
    <#if section = "header">
        Confirm another way
    <#elseif section = "form">
        <form id="kc-select-credential-form" action="${url.loginAction}" method="post">
            <ul class="nkwapa-option-list">
                <#list auth.authenticationSelections as authenticationSelection>
                    <li>
                        <button class="nkwapa-option" type="submit" name="authenticationExecution" value="${authenticationSelection.authExecId}">
                            <span class="nkwapa-option__text">
                                <span class="nkwapa-option__title">${msg('${authenticationSelection.displayName}')}</span>
                                <span class="nkwapa-option__detail">${msg('${authenticationSelection.helpText}')}</span>
                            </span>
                            <svg class="nkwapa-option__chevron" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                        </button>
                    </li>
                </#list>
            </ul>
        </form>
    </#if>
</@layout.registrationLayout>
