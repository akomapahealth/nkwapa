<#macro passwordToggle targetId>
    <button
        type="button"
        class="nkwapa-password-toggle"
        aria-label="Show password"
        aria-controls="${targetId}"
        aria-pressed="false"
        data-password-toggle-target="${targetId}"
    >
        <span class="nkwapa-icon-eye nkwapa-icon-eye--open" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        </span>
        <span class="nkwapa-icon-eye nkwapa-icon-eye--off" hidden aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
        </span>
    </button>
</#macro>

<#--
  The journeys these pages sit inside (#277). The same lists, in the same words, appear on the
  app's /login, /accept-invite and /claim-record, so a person crossing from Nkwapa to this server
  and back sees one path rather than three unrelated screens. Presentation only: the steps
  describe the existing flows and change none of them.
-->
<#macro journeyList journey step>
    <#if journey == "signin">
        <#local journeyTitle = "Signing in" />
        <#local journeySteps = [
            {"label": "Start from Nkwapa", "detail": "You chose to sign in."},
            {"label": "Enter your email and password", "detail": "On this secure page, which is separate from Nkwapa."},
            {"label": "Your work opens", "detail": "Staff see their clinic. Patients see their record."}
        ] />
    <#elseif journey == "setup">
        <#local journeyTitle = "Setting up your account" />
        <#local journeySteps = [
            {"label": "Open your invitation email", "detail": "The link brought you here."},
            {"label": "Choose a password", "detail": "And confirm your email address if asked."},
            {"label": "Finish in Nkwapa", "detail": "Staff accept their clinic and role. Patients confirm their clinic card."}
        ] />
    <#elseif journey == "reset">
        <#local journeyTitle = "Resetting your password" />
        <#local journeySteps = [
            {"label": "Ask for a reset link", "detail": "Enter the email address on your account."},
            {"label": "Open the email", "detail": "It arrives in a few minutes. Check spam too."},
            {"label": "Choose a new password", "detail": "Then sign in with it."}
        ] />
    </#if>
    <#if journeySteps??>
        <section class="nkwapa-journey" aria-labelledby="nkwapa-journey-title">
            <h2 id="nkwapa-journey-title" class="nkwapa-journey__title">${journeyTitle}</h2>
            <ol class="nkwapa-journey__list">
                <#list journeySteps as item>
                    <#local n = item?index + 1 />
                    <#local state = (n < step)?then("done", (n == step)?then("current", "next")) />
                    <li class="nkwapa-journey__step nkwapa-journey__step--${state}"<#if state == "current"> aria-current="step"</#if>>
                        <span class="nkwapa-journey__marker" aria-hidden="true"><#if state == "done">&#10003;<#else>${n}</#if></span>
                        <span class="nkwapa-journey__text">
                            <span class="nkwapa-journey__label">${item.label}</span>
                            <span class="nkwapa-journey__detail"><span class="nkwapa-journey__state"><#if state == "done">Done<#elseif state == "current">You are here<#else>Still to do</#if></span><#if state != "done">. ${item.detail}</#if></span>
                        </span>
                    </li>
                </#list>
            </ol>
        </section>
    <#elseif journey == "help">
        <section class="nkwapa-journey" aria-labelledby="nkwapa-journey-title">
            <h2 id="nkwapa-journey-title" class="nkwapa-journey__title">When a link stops working</h2>
            <ul class="nkwapa-journey__list">
                <li class="nkwapa-journey__help">
                    <span class="nkwapa-journey__label">It has expired or been used</span>
                    <span class="nkwapa-journey__detail">Invitation and password links stop working after a few days, and once their step is done. Ask whoever sent it for a new one.</span>
                </li>
                <li class="nkwapa-journey__help">
                    <span class="nkwapa-journey__label">Someone else is signed in</span>
                    <span class="nkwapa-journey__detail">On a shared laptop, sign the other person out of Nkwapa, then open your link again.</span>
                </li>
                <li class="nkwapa-journey__help">
                    <span class="nkwapa-journey__label">You already chose a password</span>
                    <span class="nkwapa-journey__detail">Then the link has done its job. Go back to sign in and use your password.</span>
                </li>
            </ul>
        </section>
    </#if>
</#macro>

<#macro registrationLayout displayMessage=true displayInfo=false displayRequiredFields=false journey="signin" step=2 eyebrow="Secure sign in" description="">
<!DOCTYPE html>
<html lang="${(locale.currentLanguageTag)!'en'}">
<head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${msg("loginTitle", ((realm.displayName)!'Nkwapa'))}</title>
    <#assign themeStyles = (properties.styles)!'' />
    <#if themeStyles?has_content>
        <#list themeStyles?split(' ') as style>
            <link href="${url.resourcesPath}/${style}" rel="stylesheet" />
        </#list>
    </#if>
    <#assign themeScripts = (properties.scripts)!'' />
</head>
<body class="nkwapa-auth-body">
    <header class="nkwapa-auth-header">
        <div class="nkwapa-auth-header__inner">
            <img src="${url.resourcesPath}/img/nkwapa-logo.png" alt="Nkwapa" class="nkwapa-auth-logo" />
            <span class="nkwapa-auth-header__note">Secure sign-in</span>
        </div>
    </header>
    <main class="nkwapa-auth-shell">
        <section class="nkwapa-auth-panel">
            <div class="nkwapa-auth-panel__header">
                <p class="nkwapa-auth-panel__eyebrow">${eyebrow}</p>
                <h1 id="kc-page-title" class="nkwapa-auth-title">
                    <#nested "header">
                </h1>
                <#if description?has_content>
                    <p class="nkwapa-auth-panel__description">${description}</p>
                </#if>
            </div>

            <#if displayMessage && message?has_content>
                <div class="nkwapa-alert nkwapa-alert--${message.type!'info'}" role="alert">
                    ${kcSanitize(message.summary)?no_esc}
                </div>
            </#if>

            <#if displayRequiredFields>
                <p class="nkwapa-required-note">${msg("requiredFields")}</p>
            </#if>

            <div class="nkwapa-auth-form">
                <#nested "form">
            </div>

            <#if displayInfo>
                <div class="nkwapa-auth-info">
                    <#nested "info">
                </div>
            </#if>
        </section>

        <#if journey != "none">
            <aside class="nkwapa-auth-aside">
                <@journeyList journey=journey step=step />
                <#-- Desktop only, and lazy, so a phone on clinic data never downloads it. -->
                <img src="${url.resourcesPath}/img/auth-clinic.jpg" alt="" class="nkwapa-auth-photo" loading="lazy" />
            </aside>
        </#if>
    </main>
    <#if themeScripts?has_content>
        <#list themeScripts?split(' ') as script>
            <script src="${url.resourcesPath}/${script}" defer></script>
        </#list>
    </#if>
</body>
</html>
</#macro>
