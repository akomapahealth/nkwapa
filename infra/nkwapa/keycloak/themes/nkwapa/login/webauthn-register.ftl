<#import "template.ftl" as layout>
<#--
  Passkey setup, from Settings in Nkwapa or required at sign-in. The hidden fields, the form id
  "register", the button id and the input object are the contract of Keycloak's
  webauthnRegister.js; keep them.
-->
<#assign fromSettings = isAppInitiatedAction??>
<@layout.registrationLayout
    journey="setup-passkey"
    step=2
    fromSettings=fromSettings
    description=fromSettings?then("After your password, Nkwapa will ask you to confirm with your fingerprint, face or screen lock. Your fingerprint and face never leave this device.", "Your account needs a second step at sign-in. A passkey confirms it is you with your fingerprint, face or screen lock.");
    section>
    <#if section = "header">
        Add a passkey
    <#elseif section = "form">
        <form id="register" action="${url.loginAction}" method="post">
            <input type="hidden" id="clientDataJSON" name="clientDataJSON"/>
            <input type="hidden" id="attestationObject" name="attestationObject"/>
            <input type="hidden" id="publicKeyCredentialId" name="publicKeyCredentialId"/>
            <input type="hidden" id="authenticatorLabel" name="authenticatorLabel"/>
            <input type="hidden" id="transports" name="transports"/>
            <input type="hidden" id="error" name="error"/>

            <div class="nkwapa-form-group">
                <p class="nkwapa-step__detail">When you continue, your device opens its own window. Confirm there and you come straight back.</p>
            </div>

            <div class="nkwapa-form-group">
                <label for="nkwapa-passkey-name" class="nkwapa-label">Name this passkey <span class="nkwapa-label__optional">(optional)</span></label>
                <#-- No name attribute: the script submits the name as authenticatorLabel. -->
                <input type="text" id="nkwapa-passkey-name" class="nkwapa-input" autocomplete="off" maxlength="64" aria-describedby="nkwapa-passkey-name-hint" />
                <p id="nkwapa-passkey-name-hint" class="nkwapa-hint">So an administrator can tell your devices apart, for example "Work laptop".</p>
            </div>

            <div class="nkwapa-checkbox-group nkwapa-form-group">
                <input type="checkbox" id="logout-sessions" name="logout-sessions" value="on" />
                <label for="logout-sessions">${msg("logoutOtherSessions")}</label>
            </div>
        </form>

        <div class="nkwapa-action-stack">
            <button type="button" id="registerWebAuthn" class="nkwapa-btn-primary" data-busy-label="Waiting for your device&hellip;">Add passkey</button>
            <#if !isSetRetry?has_content && isAppInitiatedAction?has_content>
                <form action="${url.loginAction}" id="kc-webauthn-settings-form" method="post">
                    <button type="submit" id="cancelWebAuthnAIA" name="cancel-aia" value="true" class="nkwapa-btn-secondary">Cancel</button>
                </form>
            </#if>
        </div>

        <script type="module">
            <#outputformat "JavaScript">
            import { registerByWebAuthn } from "${url.resourcesPath}/js/webauthnRegister.js";
            const registerButton = document.getElementById('registerWebAuthn');
            const nameField = document.getElementById('nkwapa-passkey-name');
            registerButton.addEventListener("click", function() {
                const input = {
                    challenge : ${challenge?c},
                    userid : ${userid?c},
                    username : ${username?c},
                    signatureAlgorithms : [<#list signatureAlgorithms as sigAlg>${sigAlg?c},</#list>],
                    rpEntityName : ${rpEntityName?c},
                    rpId : ${rpId?c},
                    attestationConveyancePreference : ${attestationConveyancePreference?c},
                    authenticatorAttachment : ${authenticatorAttachment?c},
                    requireResidentKey : ${requireResidentKey?c},
                    userVerificationRequirement : ${userVerificationRequirement?c},
                    createTimeout : ${createTimeout?c},
                    excludeCredentialIds : ${excludeCredentialIds?c},
                    initLabel : ${msg("webauthn-registration-init-label")?c},
                    initLabelPrompt : ${msg("webauthn-registration-init-label-prompt")?c},
                    errmsg : ${msg("webauthn-unsupported-browser-text")?c}
                };
                // shortcut: Keycloak's script asks for the name with window.prompt after the device
                // confirms; this answers it from the field above. Revisit if webauthnRegister.js
                // stops calling prompt.
                window.prompt = () => nameField.value.trim() || input.initLabel;
                registerButton.disabled = true;
                registerButton.setAttribute('aria-busy', 'true');
                registerButton.textContent = registerButton.dataset.busyLabel;
                registerByWebAuthn(input);
            }, { once: true });
            </#outputformat>
        </script>
    </#if>
</@layout.registrationLayout>
