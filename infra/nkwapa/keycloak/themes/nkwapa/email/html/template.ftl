<#--
  The branded shell every Keycloak email renders through.

  It is a deliberate copy of the app's own email layout in
  apps/api/src/notifications/templates/layout.ts -- same palette, same 560px card, same
  footer rule. A patient receives one message from each system at the same moment, and two
  emails that look unrelated are how a legitimate pair gets read as a phishing attempt.

  Table-based with inline styles for the same reason the app's layout is: webmail clients
  strip <style> blocks and support neither grid nor flex.
-->
<#macro emailLayout>
<!doctype html>
<html lang="${locale.language}" dir="${(ltr)?then('ltr','rtl')}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f9fafb">
      <tr>
        <td align="center" style="padding:24px 12px">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px">
            <tr>
              <td style="padding:24px 28px 0">
                <p style="margin:0 0 24px;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#0f766e">Nkwapa</p>
                <#nested>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 24px">
                <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.6;color:#4b5563">
                  This message was sent by Nkwapa on behalf of your clinic. Please do not reply to this email; contact your clinic directly if you need help.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
</#macro>
