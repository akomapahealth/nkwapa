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

<#macro registrationLayout displayMessage=true displayInfo=false displayRequiredFields=false>
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
    <main class="nkwapa-auth-shell">
        <section class="nkwapa-auth-card">
            <aside class="nkwapa-auth-showcase" aria-hidden="true">
                <div class="nkwapa-auth-showcase__inner">
                    <img
                        src="${url.resourcesPath}/img/nkwapa-logo.png"
                        alt="Nkwapa"
                        class="nkwapa-auth-logo"
                    />

                    <div class="nkwapa-auth-copy">
                        <span class="nkwapa-auth-eyebrow">Clinic care operations</span>
                        <h2 class="nkwapa-auth-headline">
                            Secure access for patient-safe clinic work.
                        </h2>
                        <p class="nkwapa-auth-description">
                            Sign in once to reach clinic-scoped records, queues, follow-up, and dashboard context.
                        </p>
                    </div>

                    <ul class="nkwapa-auth-feature-list">
                        <li>Keycloak verifies your identity before records load</li>
                        <li>Clinic permissions decide what you can view and update</li>
                        <li>Password recovery stays available when sign-in needs attention</li>
                    </ul>

                    <div class="nkwapa-auth-photo-frame">
                        <img
                            src="${url.resourcesPath}/img/auth-clinic.jpg"
                            alt=""
                            class="nkwapa-auth-photo"
                        />
                    </div>
                </div>
            </aside>

            <section class="nkwapa-auth-panel">
                <div class="nkwapa-auth-panel__inner">
                    <div class="nkwapa-auth-panel__header">
                        <p class="nkwapa-auth-panel__eyebrow">Secure access</p>
                        <h1 id="kc-page-title" class="nkwapa-auth-title">
                            <#nested "header">
                        </h1>
                        <p class="nkwapa-auth-panel__description">
                            Continue with the secure account your clinic uses for patient-safe operations.
                        </p>
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
                </div>
            </section>
        </section>
    </main>
    <#if themeScripts?has_content>
        <#list themeScripts?split(' ') as script>
            <script src="${url.resourcesPath}/${script}" defer></script>
        </#list>
    </#if>
</body>
</html>
</#macro>
