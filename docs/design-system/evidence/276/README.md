# #276 patient portal evidence

Captured 2026-11-03 with the seeded E2E patient on the station-OFF CI configuration.
The baseline is `release/dev` at `cfb94958e9bcb8b81321fb178ed6e35a20463190`.
Desktop captures are 1440px wide and full page. Phone captures show the first
390 × 844px screen. Each pair uses the same route, viewport and theme.

| Surface                             | Change                                                                                              |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- |
| Portal navigation                   | Three labelled destinations. The current section has a teal underline.                              |
| Overview                            | One Request an appointment action, with health readings and appointment information under rules.    |
| My Health and self-reports          | Hairline history rows, straight trend lines, and a table view for each chart.                       |
| Appointments                        | Confirmed visits and requests use hairline rows. The request action uses the same name as Overview. |
| Appointment request and new reading | The form comes before supporting information, with the same inputs and submission behavior.         |

## Screenshots

| Route                          | 1440 light                                                                                                                                        | 1440 dark                                                                                                                                       | 390 light                                                                                                                                       | 390 dark                                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `/portal`                      | [Before](before/patient/portal--desktop--light.jpg) · [After](after/patient/portal--desktop--light.jpg)                                           | [Before](before/patient/portal--desktop--dark.jpg) · [After](after/patient/portal--desktop--dark.jpg)                                           | [Before](before/patient/portal--mobile--light.jpg) · [After](after/patient/portal--mobile--light.jpg)                                           | [Before](before/patient/portal--mobile--dark.jpg) · [After](after/patient/portal--mobile--dark.jpg)                                           |
| `/portal/health`               | [Before](before/patient/portal_health--desktop--light.jpg) · [After](after/patient/portal_health--desktop--light.jpg)                             | [Before](before/patient/portal_health--desktop--dark.jpg) · [After](after/patient/portal_health--desktop--dark.jpg)                             | [Before](before/patient/portal_health--mobile--light.jpg) · [After](after/patient/portal_health--mobile--light.jpg)                             | [Before](before/patient/portal_health--mobile--dark.jpg) · [After](after/patient/portal_health--mobile--dark.jpg)                             |
| `/portal/appointments`         | [Before](before/patient/portal_appointments--desktop--light.jpg) · [After](after/patient/portal_appointments--desktop--light.jpg)                 | [Before](before/patient/portal_appointments--desktop--dark.jpg) · [After](after/patient/portal_appointments--desktop--dark.jpg)                 | [Before](before/patient/portal_appointments--mobile--light.jpg) · [After](after/patient/portal_appointments--mobile--light.jpg)                 | [Before](before/patient/portal_appointments--mobile--dark.jpg) · [After](after/patient/portal_appointments--mobile--dark.jpg)                 |
| `/portal/appointments/request` | [Before](before/patient/portal_appointments_request--desktop--light.jpg) · [After](after/patient/portal_appointments_request--desktop--light.jpg) | [Before](before/patient/portal_appointments_request--desktop--dark.jpg) · [After](after/patient/portal_appointments_request--desktop--dark.jpg) | [Before](before/patient/portal_appointments_request--mobile--light.jpg) · [After](after/patient/portal_appointments_request--mobile--light.jpg) | [Before](before/patient/portal_appointments_request--mobile--dark.jpg) · [After](after/patient/portal_appointments_request--mobile--dark.jpg) |
| `/portal/self-reports`         | [Before](before/patient/portal_self-reports--desktop--light.jpg) · [After](after/patient/portal_self-reports--desktop--light.jpg)                 | [Before](before/patient/portal_self-reports--desktop--dark.jpg) · [After](after/patient/portal_self-reports--desktop--dark.jpg)                 | [Before](before/patient/portal_self-reports--mobile--light.jpg) · [After](after/patient/portal_self-reports--mobile--light.jpg)                 | [Before](before/patient/portal_self-reports--mobile--dark.jpg) · [After](after/patient/portal_self-reports--mobile--dark.jpg)                 |
| `/portal/self-reports/new`     | [Before](before/patient/portal_self-reports_new--desktop--light.jpg) · [After](after/patient/portal_self-reports_new--desktop--light.jpg)         | [Before](before/patient/portal_self-reports_new--desktop--dark.jpg) · [After](after/patient/portal_self-reports_new--desktop--dark.jpg)         | [Before](before/patient/portal_self-reports_new--mobile--light.jpg) · [After](after/patient/portal_self-reports_new--mobile--light.jpg)         | [Before](before/patient/portal_self-reports_new--mobile--dark.jpg) · [After](after/patient/portal_self-reports_new--mobile--dark.jpg)         |

## Accessibility and responsive checks

Axe found zero violations in all 24 before scans and all 24 after scans. None
of the 48 captures showed horizontal overflow.

[Axe before](before/axe.json) · [Axe after](after/axe.json)

The portal browser spec measures the visible navigation and content controls
at 390px. It also checks keyboard focus, patient-only access and both themes.
The offline spec exercises the saved-copy notice and the request form’s
connection requirement.
