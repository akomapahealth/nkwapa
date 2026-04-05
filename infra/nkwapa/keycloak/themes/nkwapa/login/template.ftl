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
</head>
<body class="nkwapa-auth-body">
    <main class="nkwapa-auth-shell">
        <section class="nkwapa-auth-card">
            <aside class="nkwapa-auth-showcase" aria-hidden="true">
                <div class="nkwapa-auth-showcase__inner">
                    <img
                        src="${url.resourcesPath}/img/nkwapa-logo.svg"
                        alt="Nkwapa"
                        class="nkwapa-auth-logo"
                    />

                    <div class="nkwapa-auth-copy">
                        <span class="nkwapa-auth-eyebrow">Multi-clinic care operations</span>
                        <h2 class="nkwapa-auth-headline">
                            Secure access for care teams across clinics, locations, and patient workflows.
                        </h2>
                        <p class="nkwapa-auth-description">
                            Review patient records, manage follow-up, and move between clinic workspaces with a single trusted sign-in.
                        </p>
                    </div>

                    <ul class="nkwapa-auth-feature-list">
                        <li>Protected access with short-lived sessions</li>
                        <li>Clinic-aware permissions and patient-safe workflows</li>
                        <li>Fast recovery when a session expires or needs attention</li>
                    </ul>

                    <img
                        src="${url.resourcesPath}/img/nkwapa-clinic-illustration.svg"
                        alt=""
                        class="nkwapa-auth-illustration"
                    />
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
                            Continue to your clinic workspace with the same secure login used for patient-safe operations.
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
</body>
</html>
</#macro>
