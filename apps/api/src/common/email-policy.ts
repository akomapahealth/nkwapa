import { BadRequestException, Injectable } from '@nestjs/common';
import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';
import { resolveMx } from 'dns/promises';
import { isIP } from 'net';

const DISALLOWED_EXACT_DOMAINS = new Set([
  'localhost',
  'example.com',
  'example.net',
  'example.org',
  'mailinator.com',
  '10minutemail.com',
  'guerrillamail.com',
  'tempmail.com',
  'yopmail.com',
]);

const DISALLOWED_DOMAIN_SUFFIXES = ['.localhost', '.test', '.invalid', '.example'];

export interface EmailDomainPolicyResult {
  allowed: boolean;
  domain: string | null;
  reason?: 'missing-domain' | 'reserved-domain' | 'ip-literal' | 'disposable-domain';
}

export function getEmailDomain(email: string): string | null {
  const atIndex = email.lastIndexOf('@');
  if (atIndex < 0 || atIndex === email.length - 1) {
    return null;
  }

  return email
    .slice(atIndex + 1)
    .trim()
    .toLowerCase();
}

export function classifyEmailDomain(email: string): EmailDomainPolicyResult {
  const domain = getEmailDomain(email);
  if (!domain) {
    return { allowed: false, domain: null, reason: 'missing-domain' };
  }

  const unwrappedDomain =
    domain.startsWith('[') && domain.endsWith(']') ? domain.slice(1, -1) : domain;

  if (isIP(unwrappedDomain)) {
    return { allowed: false, domain, reason: 'ip-literal' };
  }

  if (DISALLOWED_EXACT_DOMAINS.has(domain)) {
    const reason =
      domain.includes('mailinator') ||
      domain.includes('10minutemail') ||
      domain.includes('guerrillamail') ||
      domain.includes('tempmail') ||
      domain.includes('yopmail')
        ? 'disposable-domain'
        : 'reserved-domain';
    return { allowed: false, domain, reason };
  }

  if (DISALLOWED_DOMAIN_SUFFIXES.some((suffix) => domain.endsWith(suffix))) {
    return { allowed: false, domain, reason: 'reserved-domain' };
  }

  return { allowed: true, domain };
}

export function IsAllowedEmailDomain(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isAllowedEmailDomain',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} uses an email domain that is not allowed`,
        ...validationOptions,
      },
      validator: {
        validate(value: unknown) {
          if (value === undefined || value === null || value === '') {
            return true;
          }
          if (typeof value !== 'string') {
            return false;
          }

          return classifyEmailDomain(value).allowed;
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} uses an email domain that is not allowed`;
        },
      },
    });
  };
}

/**
 * Domains whose MX lookup is skipped, from EMAIL_DELIVERABILITY_ALLOWED_DOMAINS.
 *
 * Test and staging fixtures use domains that deliberately do not resolve, and an
 * end-to-end run that creates a portal invite would otherwise fail on a DNS query
 * rather than on anything it means to test. This never widens the policy: the
 * classification below still runs first, so reserved and disposable domains stay
 * refused even if someone lists them here.
 */
export function getMxExemptDomains(env: NodeJS.ProcessEnv = process.env): Set<string> {
  return new Set(
    (env.EMAIL_DELIVERABILITY_ALLOWED_DOMAINS ?? '')
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
}

@Injectable()
export class EmailDeliverabilityService {
  protected resolveMxRecords(domain: string) {
    return resolveMx(domain);
  }

  async assertDomainAcceptsEmail(email: string, field = 'email') {
    const policy = classifyEmailDomain(email);
    if (!policy.allowed || !policy.domain) {
      throw this.validationError(field, `${field} uses an email domain that is not allowed`);
    }

    // Checked only after classification, so the allowlist can never readmit a domain
    // the policy above rejected.
    if (getMxExemptDomains().has(policy.domain)) {
      return;
    }

    try {
      const records = await this.resolveMxRecords(policy.domain);
      if (records.length === 0) {
        throw this.validationError(field, `${field} domain does not accept email`);
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      throw this.validationError(field, `${field} domain could not be verified`);
    }
  }

  private validationError(field: string, message: string) {
    return new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed.',
      fieldErrors: [{ field, message }],
      recoveryAction: 'Use an email address with a domain that can receive mail.',
    });
  }
}
