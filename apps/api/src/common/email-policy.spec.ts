import { plainToInstance } from 'class-transformer';
import { IsEmail, validate } from 'class-validator';
import type { MxRecord } from 'dns';
import { ToNormalizedEmail, normalizeEmailInput } from './validation';
import {
  classifyEmailDomain,
  EmailDeliverabilityService,
  IsAllowedEmailDomain,
} from './email-policy';

class EmailDto {
  @ToNormalizedEmail()
  @IsEmail()
  @IsAllowedEmailDomain()
  email!: string;
}

class TestEmailDeliverabilityService extends EmailDeliverabilityService {
  readonly queriedDomains: string[] = [];

  constructor(private readonly result: MxRecord[] | Error) {
    super();
  }

  protected override async resolveMxRecords(domain: string) {
    this.queriedDomains.push(domain);
    if (this.result instanceof Error) {
      throw this.result;
    }
    return this.result;
  }
}

describe('email policy', () => {
  it('normalizes email input by trimming and lowercasing', () => {
    expect(normalizeEmailInput('  Ama.Patient@Example.ORG  ')).toBe('ama.patient@example.org');
  });

  it('accepts normal email domains through DTO validation', async () => {
    const dto = plainToInstance(EmailDto, { email: ' Ama.Patient@Nkwapa.Health ' });

    const errors = await validate(dto);

    expect(dto.email).toBe('ama.patient@nkwapa.health');
    expect(errors).toHaveLength(0);
  });

  it.each([
    ['malformed', 'not-an-email'],
    ['reserved exact', 'patient@example.com'],
    ['reserved suffix', 'patient@clinic.test'],
    ['localhost', 'patient@localhost'],
    ['localhost suffix', 'patient@mail.localhost'],
    ['ip literal', 'patient@[192.0.2.1]'],
    ['disposable', 'patient@mailinator.com'],
  ])('rejects %s email domains through DTO validation', async (_label, email) => {
    const dto = plainToInstance(EmailDto, { email });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.property).toBe('email');
  });

  it.each([
    ['patient@clinic.example', 'reserved-domain'],
    ['patient@[2001:db8::1]', 'ip-literal'],
    ['patient@yopmail.com', 'disposable-domain'],
  ] as const)('classifies %s as %s', (email, reason) => {
    expect(classifyEmailDomain(email)).toMatchObject({ allowed: false, reason });
  });
});

describe('EmailDeliverabilityService', () => {
  it('accepts a domain with MX records', async () => {
    const service = new TestEmailDeliverabilityService([
      { exchange: 'mx.nkwapa.health', priority: 10 },
    ]);

    await expect(
      service.assertDomainAcceptsEmail('patient@nkwapa.health'),
    ).resolves.toBeUndefined();

    expect(service.queriedDomains).toEqual(['nkwapa.health']);
  });

  it('rejects a domain with no MX records', async () => {
    const service = new TestEmailDeliverabilityService([]);

    await expect(service.assertDomainAcceptsEmail('patient@nkwapa.health')).rejects.toMatchObject({
      response: expect.objectContaining({
        fieldErrors: [{ field: 'email', message: 'email domain does not accept email' }],
      }),
    });
  });

  it('rejects DNS lookup failures in fail-closed mode', async () => {
    const service = new TestEmailDeliverabilityService(new Error('resolver unavailable'));

    await expect(service.assertDomainAcceptsEmail('patient@nkwapa.health')).rejects.toMatchObject({
      response: expect.objectContaining({
        fieldErrors: [{ field: 'email', message: 'email domain could not be verified' }],
      }),
    });
  });
});
