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

<#macro registrationLayout displayMessage=true displayInfo=false displayRequiredFields=false description="">
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
    <#-- Keycloak's passkey scripts import this module by name; without the map they never run. -->
    <script type="importmap">
        {
            "imports": {
                "rfc4648": "${url.resourcesCommonPath}/vendor/rfc4648/rfc4648.js"
            }
        }
    </script>
</head>
<#-- Nkwapa's own address, for the footer links. Pages reached from an email link often have no client. -->
<#assign nkwapaAppUrl = (properties.nkwapaWebOrigins!'')?split(",")[0]?trim?remove_ending("/") />
<body class="nkwapa-auth-body">
<div class="nkwapa-auth-sheet">
    <div class="nkwapa-auth-column">
        <header class="nkwapa-auth-header">
            <img src="${url.resourcesPath}/img/nkwapa-logo.png" alt="Nkwapa" class="nkwapa-auth-logo" />
        </header>
        <main class="nkwapa-auth-shell">
            <section class="nkwapa-auth-panel">
                <div class="nkwapa-auth-panel__header">
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

                    <#-- Someone with an authenticator app and a passkey can switch between them. -->
                    <#if auth?has_content && auth.showTryAnotherWayLink()>
                        <form id="kc-select-try-another-way-form" class="nkwapa-try-another-way" action="${url.loginAction}" method="post">
                            <input type="hidden" name="tryAnotherWay" value="on"/>
                            <button type="submit" id="try-another-way" class="nkwapa-btn-quiet">${msg("doTryAnotherWay")}</button>
                        </form>
                    </#if>
                </div>

                <#if displayInfo>
                    <div class="nkwapa-auth-info">
                        <#nested "info">
                    </div>
                </#if>
            </section>
        </main>
        <footer class="nkwapa-auth-foot">
            <p>Invitation only. Ask your clinic for access.</p>
            <#if nkwapaAppUrl?has_content>
                <nav aria-label="Legal">
                    <a href="${nkwapaAppUrl}/privacy">Privacy</a>
                    <a href="${nkwapaAppUrl}/terms">Terms</a>
                </nav>
            </#if>
        </footer>
    </div>
    <#-- One request either way: phones get the short band, wider screens the tall panel. -->
    <figure class="nkwapa-auth-photo">
        <picture>
            <source media="(max-width: 767px)" srcset="${url.resourcesPath}/img/auth-clinic-band.jpg" />
            <img src="${url.resourcesPath}/img/auth-clinic.jpg" alt="" />
        </picture>
        <figcaption class="nkwapa-auth-photo__line">One record for every visit, even offline.</figcaption>
    </figure>
</div>
    <#if themeScripts?has_content>
        <#list themeScripts?split(' ') as script>
            <script src="${url.resourcesPath}/${script}" defer></script>
        </#list>
    </#if>
</body>
</html>
</#macro>
