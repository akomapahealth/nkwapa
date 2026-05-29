<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('password','password-confirm') displayRequiredFields=true; section>
    <#if section = "header">
        choose a new password
    <#elseif section = "form">
        <form id="kc-passwd-update-form" action="${url.loginAction}" method="post">
            <div class="nkwapa-form-group">
                <label for="password-new" class="nkwapa-label">${msg("passwordNew")}</label>
                <input
                    type="password"
                    id="password-new"
                    name="password-new"
                    class="nkwapa-input"
                    autocomplete="new-password"
                    autofocus
                    aria-invalid="<#if messagesPerField.existsError('password','password-confirm')>true</#if>"
                />
                <#if messagesPerField.existsError('password')>
                    <span class="nkwapa-error" aria-live="polite">${kcSanitize(messagesPerField.getFirstError('password'))?no_esc}</span>
                </#if>
            </div>

            <div class="nkwapa-form-group">
                <label for="password-confirm" class="nkwapa-label">${msg("passwordConfirm")}</label>
                <input
                    type="password"
                    id="password-confirm"
                    name="password-confirm"
                    class="nkwapa-input"
                    autocomplete="new-password"
                    aria-invalid="<#if messagesPerField.existsError('password','password-confirm')>true</#if>"
                />
                <#if messagesPerField.existsError('password-confirm')>
                    <span class="nkwapa-error" aria-live="polite">${kcSanitize(messagesPerField.getFirstError('password-confirm'))?no_esc}</span>
                </#if>
            </div>

            <p class="nkwapa-password-requirements">
                Use at least 12 characters with uppercase and lowercase letters, a number, and a symbol.
            </p>

            <div class="nkwapa-form-group nkwapa-submit-group">
                <input class="nkwapa-btn-primary" type="submit" value="${msg("doSubmit")}"/>
            </div>
        </form>
    </#if>
</@layout.registrationLayout>
