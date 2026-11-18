<#import "template.ftl" as layout>
<#-- The second step at sign-in for an account with an authenticator app. Field names are
     Keycloak's contract: otp, selectedCredentialId, login. -->
<@layout.registrationLayout
    displayMessage=!messagesPerField.existsError('totp')
    journey="verify-otp"
    step=3
    description="Open your authenticator app and enter the code it shows for Nkwapa.";
    section>
    <#if section = "header">
        Enter your code
    <#elseif section = "form">
        <form id="kc-otp-login-form" onsubmit="login.disabled = true; return true;" action="${url.loginAction}" method="post">
            <#if otpLogin.userOtpCredentials?size gt 1>
                <fieldset class="nkwapa-choices nkwapa-form-group">
                    <legend class="nkwapa-label">Which phone?</legend>
                    <#list otpLogin.userOtpCredentials as otpCredential>
                        <label class="nkwapa-choice" for="kc-otp-credential-${otpCredential?index}">
                            <input
                                id="kc-otp-credential-${otpCredential?index}"
                                type="radio"
                                name="selectedCredentialId"
                                value="${otpCredential.id}"
                                <#if otpCredential.id == otpLogin.selectedCredentialId>checked</#if>
                            />
                            <span class="nkwapa-choice__label">${otpCredential.userLabel}</span>
                        </label>
                    </#list>
                </fieldset>
            </#if>

            <div class="nkwapa-form-group">
                <label for="otp" class="nkwapa-label">Code</label>
                <input
                    id="otp"
                    name="otp"
                    type="text"
                    class="nkwapa-input nkwapa-input--code"
                    autocomplete="one-time-code"
                    inputmode="numeric"
                    pattern="[0-9]*"
                    spellcheck="false"
                    dir="ltr"
                    autofocus
                    aria-invalid="<#if messagesPerField.existsError('totp')>true</#if>"
                    <#if messagesPerField.existsError('totp')>aria-describedby="input-error-otp-code"</#if>
                />
                <#if messagesPerField.existsError('totp')>
                    <span id="input-error-otp-code" class="nkwapa-error" aria-live="polite">${kcSanitize(messagesPerField.get('totp'))?no_esc}</span>
                </#if>
            </div>

            <div class="nkwapa-action-stack">
                <input class="nkwapa-btn-primary" name="login" id="kc-login" type="submit" value="${msg("doLogIn")}" />
                <p class="nkwapa-hint">Lost the phone with your app? Ask an administrator to reset your second step.</p>
            </div>
        </form>
    </#if>
</@layout.registrationLayout>
