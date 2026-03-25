<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('firstName','lastName','email','username','password','password-confirm'); section>
    <#if section = "header">
        create your account
    <#elseif section = "form">
        <form id="kc-register-form" class="${properties.kcFormClass!}" action="${url.registrationAction}" method="post">
            <div class="nkwapa-form-group">
                <label for="firstName" class="nkwapa-label">${msg("firstName")}</label>
                <input type="text" id="firstName" class="nkwapa-input" name="firstName"
                       value="${(register.formData.firstName!'')}"
                       aria-invalid="<#if messagesPerField.existsError('firstName')>true</#if>"
                />
                <#if messagesPerField.existsError('firstName')>
                    <span class="nkwapa-error" aria-live="polite">${kcSanitize(messagesPerField.get('firstName'))?no_esc}</span>
                </#if>
            </div>

            <div class="nkwapa-form-group">
                <label for="lastName" class="nkwapa-label">${msg("lastName")}</label>
                <input type="text" id="lastName" class="nkwapa-input" name="lastName"
                       value="${(register.formData.lastName!'')}"
                       aria-invalid="<#if messagesPerField.existsError('lastName')>true</#if>"
                />
                <#if messagesPerField.existsError('lastName')>
                    <span class="nkwapa-error" aria-live="polite">${kcSanitize(messagesPerField.get('lastName'))?no_esc}</span>
                </#if>
            </div>

            <div class="nkwapa-form-group">
                <label for="email" class="nkwapa-label">${msg("email")}</label>
                <input type="email" id="email" class="nkwapa-input" name="email"
                       value="${(register.formData.email!'')}" autocomplete="email"
                       aria-invalid="<#if messagesPerField.existsError('email')>true</#if>"
                />
                <#if messagesPerField.existsError('email')>
                    <span class="nkwapa-error" aria-live="polite">${kcSanitize(messagesPerField.get('email'))?no_esc}</span>
                </#if>
            </div>

            <#if !realm.registrationEmailAsUsername>
                <div class="nkwapa-form-group">
                    <label for="username" class="nkwapa-label">${msg("username")}</label>
                    <input type="text" id="username" class="nkwapa-input" name="username"
                           value="${(register.formData.username!'')}" autocomplete="username"
                           aria-invalid="<#if messagesPerField.existsError('username')>true</#if>"
                    />
                    <#if messagesPerField.existsError('username')>
                        <span class="nkwapa-error" aria-live="polite">${kcSanitize(messagesPerField.get('username'))?no_esc}</span>
                    </#if>
                </div>
            </#if>

            <#if passwordRequired??>
                <div class="nkwapa-form-group">
                    <label for="password" class="nkwapa-label">${msg("password")}</label>
                    <input type="password" id="password" class="nkwapa-input" name="password"
                           autocomplete="new-password"
                           aria-invalid="<#if messagesPerField.existsError('password','password-confirm')>true</#if>"
                    />
                    <#if messagesPerField.existsError('password')>
                        <span class="nkwapa-error" aria-live="polite">${kcSanitize(messagesPerField.get('password'))?no_esc}</span>
                    </#if>
                </div>

                <div class="nkwapa-form-group">
                    <label for="password-confirm" class="nkwapa-label">${msg("passwordConfirm")}</label>
                    <input type="password" id="password-confirm" class="nkwapa-input" name="password-confirm"
                           aria-invalid="<#if messagesPerField.existsError('password-confirm')>true</#if>"
                    />
                    <#if messagesPerField.existsError('password-confirm')>
                        <span class="nkwapa-error" aria-live="polite">${kcSanitize(messagesPerField.get('password-confirm'))?no_esc}</span>
                    </#if>
                </div>
            </#if>

            <div class="nkwapa-form-group nkwapa-submit-group">
                <input class="nkwapa-btn-primary" type="submit" value="${msg("doRegister")}"/>
            </div>
        </form>

        <div class="nkwapa-register-link">
            <a href="${url.loginUrl}">${kcSanitize(msg("backToLogin"))?no_esc}</a>
        </div>
    </#if>
</@layout.registrationLayout>
