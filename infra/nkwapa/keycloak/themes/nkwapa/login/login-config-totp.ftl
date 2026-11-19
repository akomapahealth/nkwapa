<#import "template.ftl" as layout>
<#--
  Authenticator app setup. Reached two ways: from Settings in Nkwapa (an application-initiated
  action, which can be cancelled), or at sign-in when the account requires a second step. Field
  names, the hidden secret and the cancel-aia button are Keycloak's contract; keep them.
-->
<#assign fromSettings = isAppInitiatedAction??>
<#assign hasFieldError = messagesPerField.existsError('totp','userLabel')>
<#-- Keycloak's "You need to set up Mobile Authenticator to activate your account" repeats the
     description below, and reads as a threat to someone who is only opting in. -->
<#assign isSetupNotice = (message?has_content && message.summary == msg("configureTotpMessage"))>
<#assign digits = totp.policy.digits>
<#assign nameRequired = totp.otpCredentials?size gte 1>
<@layout.registrationLayout
    displayMessage=!hasFieldError && !isSetupNotice
    journey="setup-otp"
    step=2
    fromSettings=fromSettings
    description=fromSettings?then("After your password, Nkwapa will ask for the code this app shows. Setup takes about a minute.", "Your account needs a second step at sign-in. Set up an authenticator app to continue; it takes about a minute.");
    section>
    <#if section = "header">
        Set up your authenticator app
    <#elseif section = "form">
        <ol class="nkwapa-steps">
            <li class="nkwapa-step">
                <span class="nkwapa-step__marker" aria-hidden="true">1</span>
                <div class="nkwapa-step__body">
                    <p class="nkwapa-step__title">Install an authenticator app on your phone</p>
                    <p class="nkwapa-step__detail">
                        <#list totp.supportedApplications as app>${msg(app)}<#if app?has_next><#if app?index == totp.supportedApplications?size - 2> or <#else>, </#if></#if></#list>.
                        Any app that shows ${digits}-digit codes works.
                    </p>
                </div>
            </li>

            <li class="nkwapa-step">
                <span class="nkwapa-step__marker" aria-hidden="true">2</span>
                <div class="nkwapa-step__body">
                    <#if mode?? && mode = "manual">
                        <p class="nkwapa-step__title">Add this key in the app</p>
                        <p class="nkwapa-step__detail">Choose to enter a setup key, then type or paste it.</p>
                        <code id="kc-totp-secret-key" class="nkwapa-secret-key">${totp.totpSecretEncoded}</code>
                        <p class="nkwapa-step__detail">
                            <#if totp.policy.type = "totp">
                                Time-based, ${digits} digits, a new code every ${totp.policy.period} seconds.
                            <#else>
                                Counter-based, ${digits} digits, starting at ${totp.policy.initialCounter}.
                            </#if>
                        </p>
                        <a href="${totp.qrUrl}" id="mode-barcode" class="nkwapa-inline-link">Scan a code instead</a>
                    <#else>
                        <p class="nkwapa-step__title">Scan this code with the app</p>
                        <p class="nkwapa-step__detail">In the app, choose to add an account, then point your camera here.</p>
                        <figure class="nkwapa-qr">
                            <img id="kc-totp-secret-qr-code" src="data:image/png;base64, ${totp.totpSecretQrCode}" alt="Setup code for your authenticator app" width="176" height="176" />
                        </figure>
                        <a href="${totp.manualUrl}" id="mode-manual" class="nkwapa-inline-link">Cannot scan it? Enter a key instead</a>
                    </#if>
                </div>
            </li>

            <li class="nkwapa-step">
                <span class="nkwapa-step__marker" aria-hidden="true">3</span>
                <div class="nkwapa-step__body">
                    <p class="nkwapa-step__title">Enter the code the app shows</p>
                    <p class="nkwapa-step__detail">The app now lists Nkwapa with a ${digits}-digit code that changes every few seconds.</p>

                    <form action="${url.loginAction}" id="kc-totp-settings-form" class="nkwapa-step__form" method="post">
                        <div class="nkwapa-form-group">
                            <label for="totp" class="nkwapa-label">${digits}-digit code</label>
                            <input
                                type="text"
                                id="totp"
                                name="totp"
                                class="nkwapa-input nkwapa-input--code"
                                autocomplete="one-time-code"
                                inputmode="numeric"
                                pattern="[0-9]*"
                                maxlength="${digits}"
                                spellcheck="false"
                                dir="ltr"
                                aria-invalid="<#if messagesPerField.existsError('totp')>true</#if>"
                                <#if messagesPerField.existsError('totp')>aria-describedby="input-error-otp-code"</#if>
                            />
                            <#if messagesPerField.existsError('totp')>
                                <span id="input-error-otp-code" class="nkwapa-error" aria-live="polite">${kcSanitize(messagesPerField.get('totp'))?no_esc}</span>
                            </#if>
                            <input type="hidden" id="totpSecret" name="totpSecret" value="${totp.totpSecret}" />
                            <#if mode??><input type="hidden" id="mode" name="mode" value="${mode}"/></#if>
                        </div>

                        <div class="nkwapa-form-group">
                            <label for="userLabel" class="nkwapa-label">Name this phone<#if !nameRequired> <span class="nkwapa-label__optional">(optional)</span></#if></label>
                            <input
                                type="text"
                                id="userLabel"
                                name="userLabel"
                                class="nkwapa-input"
                                autocomplete="off"
                                dir="ltr"
                                aria-describedby="userLabel-hint<#if messagesPerField.existsError('userLabel')> input-error-otp-label</#if>"
                                aria-invalid="<#if messagesPerField.existsError('userLabel')>true</#if>"
                            />
                            <p id="userLabel-hint" class="nkwapa-hint">So an administrator can tell your devices apart, for example "Work phone".</p>
                            <#if messagesPerField.existsError('userLabel')>
                                <span id="input-error-otp-label" class="nkwapa-error" aria-live="polite">${kcSanitize(messagesPerField.get('userLabel'))?no_esc}</span>
                            </#if>
                        </div>

                        <div class="nkwapa-checkbox-group nkwapa-form-group">
                            <input type="checkbox" id="logout-sessions" name="logout-sessions" value="on" />
                            <label for="logout-sessions">${msg("logoutOtherSessions")}</label>
                        </div>

                        <div class="nkwapa-action-stack">
                            <input type="submit" id="saveTOTPBtn" class="nkwapa-btn-primary" value="Finish setup" />
                            <#if fromSettings>
                                <button type="submit" id="cancelTOTPBtn" name="cancel-aia" value="true" class="nkwapa-btn-secondary" formnovalidate>Cancel</button>
                            </#if>
                        </div>
                    </form>
                </div>
            </li>
        </ol>
    </#if>
</@layout.registrationLayout>
