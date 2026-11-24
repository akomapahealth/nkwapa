<#import "template.ftl" as layout>
<#--
  The second step at sign-in for an account with a passkey. The form ids "webauth" and
  "authn_select", the hidden fields and the button id are the contract of Keycloak's
  webauthnAuthenticate.js; keep them.
-->
<@layout.registrationLayout
    description="Your device will ask for your fingerprint, face or screen lock.";
    section>
    <#if section = "header">
        Confirm with your passkey
    <#elseif section = "form">
        <form id="webauth" action="${url.loginAction}" method="post">
            <input type="hidden" id="clientDataJSON" name="clientDataJSON"/>
            <input type="hidden" id="authenticatorData" name="authenticatorData"/>
            <input type="hidden" id="signature" name="signature"/>
            <input type="hidden" id="credentialId" name="credentialId"/>
            <input type="hidden" id="userHandle" name="userHandle"/>
            <input type="hidden" id="error" name="error"/>
        </form>

        <#if authenticators??>
            <form id="authn_select">
                <#list authenticators.authenticators as authenticator>
                    <input type="hidden" name="authn_use_chk" value="${authenticator.credentialId}"/>
                </#list>
            </form>

            <#if shouldDisplayAuthenticators?? && shouldDisplayAuthenticators>
                <div class="nkwapa-form-group">
                    <p class="nkwapa-label"><#if authenticators.authenticators?size gt 1>Your passkeys<#else>Your passkey</#if></p>
                    <ul class="nkwapa-credential-list">
                        <#list authenticators.authenticators as authenticator>
                            <li id="kc-webauthn-authenticator-item-${authenticator?index}" class="nkwapa-credential">
                                <span id="kc-webauthn-authenticator-label-${authenticator?index}" class="nkwapa-credential__label">${authenticator.label}</span>
                                <span class="nkwapa-credential__meta">
                                    Added <span id="kc-webauthn-authenticator-created-${authenticator?index}">${authenticator.createdAt}</span>
                                </span>
                            </li>
                        </#list>
                    </ul>
                </div>
            </#if>
        </#if>

        <div class="nkwapa-action-stack">
            <button type="button" id="authenticateWebAuthnButton" class="nkwapa-btn-primary" autofocus data-busy-label="Waiting for your device&hellip;">Use passkey</button>
            <p class="nkwapa-hint">Lost the device with your passkey? Ask an administrator to reset your second step.</p>
        </div>

        <script type="module">
            <#outputformat "JavaScript">
            import { authenticateByWebAuthn } from "${url.resourcesPath}/js/webauthnAuthenticate.js";
            const authButton = document.getElementById('authenticateWebAuthnButton');
            authButton.addEventListener("click", function() {
                const input = {
                    isUserIdentified : ${isUserIdentified},
                    challenge : ${challenge?c},
                    userVerification : ${userVerification?c},
                    rpId : ${rpId?c},
                    createTimeout : ${createTimeout?c},
                    errmsg : ${msg("webauthn-unsupported-browser-text")?c}
                };
                authButton.disabled = true;
                authButton.setAttribute('aria-busy', 'true');
                authButton.textContent = authButton.dataset.busyLabel;
                authenticateByWebAuthn(input);
            }, { once: true });
            </#outputformat>
        </script>
    </#if>
</@layout.registrationLayout>
