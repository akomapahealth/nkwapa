/**
 * DI token for the resolved email provider.
 *
 * A shared constant rather than a bare string literal at each injection site: the old
 * `@Inject('EmailProvider')` string was declared privately inside ReminderModule and
 * never exported, which is why no other module could send mail at all.
 */
export const EMAIL_PROVIDER = 'EmailProvider';
