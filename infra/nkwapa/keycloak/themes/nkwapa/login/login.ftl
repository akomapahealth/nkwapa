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
                                <button type="button" id="nkwapa-password-toggle" class="nkwapa-password-toggle" tabindex="3" aria-label="Show password" aria-controls="password" aria-pressed="false">
                                    <span class="nkwapa-icon-eye nkwapa-icon-eye--open" aria-hidden="true">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                    </span>
                                    <span class="nkwapa-icon-eye nkwapa-icon-eye--off" hidden aria-hidden="true">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                                    </span>
                                </button>
                            </div>
                        </div>
                        <script>
                        (function () {
                          var input = document.getElementById("password");
                          var btn = document.getElementById("nkwapa-password-toggle");
                          if (!input || !btn) return;
                          var open = btn.querySelector(".nkwapa-icon-eye--open");
                          var off = btn.querySelector(".nkwapa-icon-eye--off");
                          function sync() {
                            var visible = input.type === "text";
                            btn.setAttribute("aria-pressed", visible ? "true" : "false");
                            btn.setAttribute("aria-label", visible ? "Hide password" : "Show password");
                            if (open) open.hidden = visible;
                            if (off) off.hidden = !visible;
                          }
                          btn.addEventListener("click", function () {
                            input.type = input.type === "password" ? "text" : "password";
                            sync();
                          });
                          sync();
                        })();
                        </script>

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
