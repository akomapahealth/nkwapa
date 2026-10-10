<#--
  Every Keycloak required-actions email renders through here, not only the patient portal one.

  The first version of this template assumed the only caller and opened by telling the reader
  their clinic had invited them to view their own medical record, because the portal invite was
  the only thing that triggered it from application code. It is not the only trigger. An
  administrator resetting a doctor's password from the Keycloak console sends exactly this
  email, and that doctor was told they had been invited to view a health record, then pointed
  at an invitation email that does not exist.

  So the copy states only what is true of every recipient, and the cross-reference to the
  portal invitation is conditional. The anti-phishing pairing still holds: the application's
  invitation names this message by subject, which is the direction that carries weight, since
  the message with the patient code and the clinic name is the one vouching for the bare link.
-->
<#import "template.ftl" as layout>
<@layout.emailLayout>
  <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#111827">Choose your password</h1>
  <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#111827">Your clinic has asked you to set a password for your Nkwapa account. Choose one now to finish setting it up.</p>
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px">
    <tr>
      <td style="border-radius:8px;background:#0f766e">
        <a href="${link}" style="display:inline-block;padding:12px 24px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none">Choose my password</a>
      </td>
    </tr>
  </table>
  <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#4b5563">This link can only be used once, and expires in ${linkExpirationFormatter(linkExpiration)}. If it has expired, ask your clinic to send it again.</p>
  <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#4b5563">If you were invited to the patient portal, your clinic has also emailed you the patient code you will be asked for after signing in.</p>
  <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#4b5563">If you were not expecting this, you can ignore this email. Nothing changes until the link above is used.</p>
</@layout.emailLayout>
