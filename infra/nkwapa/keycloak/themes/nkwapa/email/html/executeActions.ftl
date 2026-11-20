<#--
  Every Keycloak required-actions email renders through here: invitations, and an administrator
  resetting a password from the Keycloak console.

  Since #383 an invitation sends only this email. The API stores the invitation on the user as
  admin-only attributes (nkwapa_invite_*) just before asking Keycloak to send it, and clears them
  once the invitation is accepted, claimed or cancelled. The invitation copy shows only while
  nkwapa_invite_expires is in the future, so a console reset never repeats a stale one.
-->
<#import "template.ftl" as layout>
<#assign attrs = user.attributes>
<#assign kind = (attrs.nkwapa_invite_kind)!"">
<#assign expires = (attrs.nkwapa_invite_expires)!"">
<#assign invited = kind?has_content && expires?has_content && (expires?number > .now?long)>
<#assign clinic = (attrs.nkwapa_invite_clinic)!"your clinic">
<#assign role = (attrs.nkwapa_invite_role)!"">
<#assign inviter = (attrs.nkwapa_invite_inviter)!"">
<#assign code = (attrs.nkwapa_invite_code)!"">
<#assign h1 = "margin:0 0 16px;font-size:22px;line-height:1.3;color:#19282e">
<#assign body = "margin:0 0 16px;font-size:16px;line-height:1.6;color:#19282e">
<#assign note = "margin:0 0 12px;font-size:14px;line-height:1.6;color:#55666d">
<#assign label = "padding:4px 16px 4px 0;font-size:14px;color:#55666d">
<#assign value = "padding:4px 0;font-size:14px;font-weight:600;color:#19282e">
<@layout.emailLayout>
<#if invited && kind == "staff">
  <h1 style="${h1}">Join ${clinic} on Nkwapa</h1>
  <p style="${body}"><#if inviter?has_content>${inviter} invited you<#else>You have been invited</#if> to join ${clinic}<#if role?has_content> as ${role}</#if>. Set up your account, then accept the invitation.</p>
<#elseif invited && kind == "portal">
  <h1 style="${h1}">Your ${clinic} patient account</h1>
  <p style="${body}">${clinic} has set up a patient account for you on Nkwapa. Set your password, then enter your patient code and date of birth.</p>
<#else>
  <h1 style="${h1}">Choose your password</h1>
  <p style="${body}">Your clinic has asked you to set a password for your Nkwapa account. Choose one now to finish setting it up.</p>
</#if>
<#if invited>
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px">
    <tr><td style="${label}">Clinic</td><td style="${value}">${clinic}</td></tr>
<#if kind == "staff" && role?has_content>
    <tr><td style="${label}">Role</td><td style="${value}">${role}</td></tr>
</#if>
<#if kind == "portal" && code?has_content>
    <tr><td style="${label}">Patient code</td><td style="${value};font-family:ui-monospace,Menlo,Consolas,monospace;letter-spacing:0.5px">${code}</td></tr>
</#if>
  </table>
</#if>
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px">
    <tr>
      <td style="border-radius:6px;background:#00778a">
        <a href="${link}" style="display:inline-block;padding:12px 24px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none"><#if invited>Set up my account<#else>Choose my password</#if></a>
      </td>
    </tr>
  </table>
  <p style="${note}">The link works once and expires in ${linkExpirationFormatter(linkExpiration)}. If it has expired, ask your clinic to send it again.</p>
<#if invited>
  <p style="${note}">This invitation is for you alone, so please don't forward it.</p>
</#if>
  <p style="${note}">Not expecting this? You can ignore it. Nothing changes until the link is used.</p>
</@layout.emailLayout>
