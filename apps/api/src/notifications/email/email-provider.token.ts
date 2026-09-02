/**
 * DI token for the resolved email provider.
 *
 * A shared constant rather than a bare string literal at each injection site: the old
 * `@Inject('EmailProvider')` string was declared privately inside ReminderModule and
 * never exported, which is why no other module could send mail at all.
 */
export const EMAIL_PROVIDER = 'EmailProvider';

/**
 * DI token for the resolved email configuration.
 *
 * A separate token rather than a defaulted constructor argument: Nest treats every
 * constructor parameter as an injection site regardless of its default, so a service
 * written as `constructor(config = resolveEmailConfig())` resolves it to null and fails
 * at boot. Unit tests construct the service directly and never see that.
 */
export const EMAIL_CONFIG = 'EmailConfig';
