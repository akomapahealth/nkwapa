<#import "template.ftl" as layout>
<@layout.registrationLayout displayInfo=true displayMessage=!messagesPerField.existsError('username'); section>
    <#if section = "header">
        reset your password
    <#elseif section = "form">
        <form id="kc-reset-password-form" action="${url.loginAction}" method="post">
            <div class="nkwapa-form-group">
                <label for="username" class="nkwapa-label">
                    <#if !realm.loginWithEmailAllowed>${msg("username")}<#elseif !realm.registrationEmailAsUsername>${msg("usernameOrEmail")}<#else>${msg("email")}</#if>
                </label>
                <input type="text" id="username" name="username" class="nkwapa-input" autofocus
                       value="${(auth.attemptedUsername!'')}"
                       aria-invalid="<#if messagesPerField.existsError('username')>true</#if>"
                />
                <#if messagesPerField.existsError('username')>
                    <span class="nkwapa-error" aria-live="polite">${kcSanitize(messagesPerField.getFirstError('username'))?no_esc}</span>
                </#if>
            </div>

            <div class="nkwapa-form-group nkwapa-submit-group">
                <input class="nkwapa-btn-primary" type="submit" value="${msg("doSubmit")}"/>
            </div>
        </form>

        <div class="nkwapa-register-link" style="margin-top: 1rem;">
            <a href="${url.loginUrl}">${kcSanitize(msg("backToLogin"))?no_esc}</a>
        </div>
    <#elseif section = "info">
        <p class="nkwapa-register-link">${msg("emailInstruction")}</p>
    </#if>
</@layout.registrationLayout>
