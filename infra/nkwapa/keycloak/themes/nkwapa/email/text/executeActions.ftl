<#-- The plain-text counterpart of html/executeActions.ftl. Keep the two in step. -->
<#-- Keycloak escapes this file as HTML too, which would print "&amp;" for "&" in a clinic name. -->
<#outputformat "plainText">
<#assign attrs = user.attributes>
<#assign kind = (attrs.nkwapa_invite_kind)!"">
<#assign expires = (attrs.nkwapa_invite_expires)!"">
<#assign invited = kind?has_content && expires?has_content && (expires?number > .now?long)>
<#assign clinic = (attrs.nkwapa_invite_clinic)!"your clinic">
<#assign role = (attrs.nkwapa_invite_role)!"">
<#assign inviter = (attrs.nkwapa_invite_inviter)!"">
<#assign code = (attrs.nkwapa_invite_code)!"">
NKWAPA

<#if invited && kind == "staff">
Join ${clinic} on Nkwapa

<#if inviter?has_content>${inviter} invited you<#else>You have been invited</#if> to join ${clinic}<#if role?has_content> as ${role}</#if>. Set up your account, then accept the invitation.

Clinic: ${clinic}
<#if role?has_content>
Role: ${role}
</#if>

Set up my account: ${link}
<#elseif invited && kind == "portal">
Your ${clinic} patient account

${clinic} has set up a patient account for you on Nkwapa. Set your password, then enter your patient code and date of birth.

Clinic: ${clinic}
<#if code?has_content>
Patient code: ${code}
</#if>

Set up my account: ${link}
<#else>
Choose your password

Your clinic has asked you to set a password for your Nkwapa account. Choose one now to finish setting it up.

Choose my password: ${link}
</#if>

The link works once and expires in ${linkExpirationFormatter(linkExpiration)}. If it has expired, ask your clinic to send it again.
<#if invited>

This invitation is for you alone, so please don't forward it.
</#if>

Not expecting this? You can ignore it. Nothing changes until the link is used.

This message was sent by Nkwapa on behalf of your clinic. Please do not reply to this email; contact your clinic directly if you need help.
</#outputformat>
