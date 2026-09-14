<#--
  Sent when a clinic invites a patient to the portal. The API creates the identity and asks
  Keycloak to email these actions; the token in ${link} is what authorises the whole flow,
  which is why the invite the API sends carries no secret of its own.

  The copy names the companion email on purpose. Two messages arriving together, neither
  acknowledging the other, is indistinguishable from a phishing pair.
-->
<#import "template.ftl" as layout>
<@layout.emailLayout>
  <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#111827">Choose your password</h1>
  <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#111827">Your clinic has invited you to see your health record online. Choose a password to finish setting up your account, and we will take you straight to the next step.</p>
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px">
    <tr>
      <td style="border-radius:8px;background:#0f766e">
        <a href="${link}" style="display:inline-block;padding:12px 24px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none">Choose my password</a>
      </td>
    </tr>
  </table>
  <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#4b5563">This link can only be used once, and expires in ${linkExpirationFormatter(linkExpiration)}. If it has expired, ask your clinic to send the invitation again.</p>
  <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#4b5563">You should also have an email titled &quot;Set up your patient account&quot;, which carries the patient code you will be asked for once you have signed in.</p>
  <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#4b5563">If you were not expecting this, you can ignore this email. Nothing changes until the link above is used.</p>
</@layout.emailLayout>
