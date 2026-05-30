<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('username','password') displayInfo=realm.password && realm.registrationAllowed && !registrationDisabled??; section>
    <#if section = "header">
        sign in to nkwapa
    <#elseif section = "form">
        <div id="kc-form">
            <div id="kc-form-wrapper">
                <#if realm.password>
                    <form id="kc-form-login" onsubmit="login.disabled = true; return true;" action="${url.loginAction}" method="post">
                        <div class="nkwapa-form-group">
                            <label for="username" class="nkwapa-label">
                                <#if !realm.loginWithEmailAllowed>${msg("username")}<#elseif !realm.registrationEmailAsUsername>${msg("usernameOrEmail")}<#else>${msg("email")}</#if>
                            </label>
                            <input tabindex="1" id="username" class="nkwapa-input" name="username" value="${(login.username!'')}" type="text" autofocus autocomplete="off"
                                   aria-invalid="<#if messagesPerField.existsError('username','password')>true</#if>"
                            />
                            <#if messagesPerField.existsError('username','password')>
                                <span class="nkwapa-error" aria-live="polite">
                                    ${kcSanitize(messagesPerField.getFirstError('username','password'))?no_esc}
                                </span>
                            </#if>
                        </div>

                        <div class="nkwapa-form-group">
                            <label for="password" class="nkwapa-label">${msg("password")}</label>
                            <div class="nkwapa-password-wrap">
                                <input tabindex="2" id="password" class="nkwapa-input nkwapa-input--with-toggle" name="password" type="password" autocomplete="current-password"
                                       aria-invalid="<#if messagesPerField.existsError('username','password')>true</#if>"
                                />
                                <@layout.passwordToggle targetId="password" />
                            </div>
                        </div>

                        <div class="nkwapa-form-options">
                            <#if realm.rememberMe && !usernameEditDisabled??>
                                <div class="nkwapa-checkbox-group">
                                    <input tabindex="4" id="rememberMe" name="rememberMe" type="checkbox" <#if login.rememberMe??>checked</#if>>
                                    <label for="rememberMe">${msg("rememberMe")}</label>
                                </div>
                            </#if>
                            <#if realm.resetPasswordAllowed>
                                <a tabindex="6" href="${url.loginResetCredentialsUrl}" class="nkwapa-forgot-link">${msg("doForgotPassword")}</a>
                            </#if>
                        </div>

                        <div class="nkwapa-form-group nkwapa-submit-group">
                            <input type="hidden" id="id-hidden-input" name="credentialId" <#if auth.selectedCredential?has_content>value="${auth.selectedCredential}"</#if>/>
                            <input tabindex="5" class="nkwapa-btn-primary" name="login" id="kc-login" type="submit" value="${msg("doLogIn")}"/>
                        </div>
                    </form>
                </#if>
            </div>
        </div>
    <#elseif section = "info">
        <#if realm.password && realm.registrationAllowed && !registrationDisabled??>
            <div class="nkwapa-register-link">
                ${msg("noAccount")} <a tabindex="7" href="${url.registrationUrl}">${msg("doRegister")}</a>
            </div>
        </#if>
    </#if>
</@layout.registrationLayout>
