import { BadRequestException, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { SYNC_MUTATION_RESULT_STATUS } from './dto/sync-push-response.dto';
import { SYNC_PUSH_BODY_PIPE, SyncController } from './sync.controller';
import { SyncService } from './sync.service';

type RequestShape = {
  query?: Record<string, string>;
  headers?: Record<string, string>;
  ip?: string;
  user?: typeof mockUserWithRoles;
};

const mockUserWithRoles = {
  user: {
    id: 'user-1',
    keycloakSub: 'test-sub',
    displayName: 'Test User',
    email: 'test@example.com',
    phoneE164: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  roles: [
    { clinicId: 'clinic-1', role: UserRole.VOLUNTEER },
    { clinicId: null, role: UserRole.SYSTEM_ADMIN },
  ],
};

const mutations = [
  {
    id: 'mut-1',
    entityType: 'patient',
    entityId: 'patient-1',
    operation: 'UPSERT' as const,
    clinicId: 'clinic-1',
    payloadJson: {
      nationalId: '123',
      primaryClinicId: 'clinic-1',
      firstName: 'J',
      lastName: 'D',
    },
    idempotencyKey: 'idem-1',
  },
];

const createAuthGuard = () => ({
  canActivate: (context: ExecutionContext) => {
    const req = context.switchToHttp().getRequest<RequestShape>();
    const auth = req.headers?.authorization;
    if (auth?.startsWith('Bearer ')) {
      req.user = mockUserWithRoles;
      return true;
    }
    throw new UnauthorizedException();
  },
});

function createExecutionContext(
  controller: SyncController,
  handlerName: keyof SyncController,
  request: RequestShape,
): ExecutionContext {
  return {
    getHandler: () => controller[handlerName] as unknown as (...args: unknown[]) => unknown,
    getClass: () => SyncController,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => undefined,
      getNext: () => undefined,
    }),
  } as unknown as ExecutionContext;
}

describe('SyncController', () => {
  let controller: SyncController;
  let syncService: {
    applyMutations: jest.Mock;
    pull: jest.Mock;
  };
  let clinicScopeGuard: ClinicScopeGuard;
  let rbacGuard: RbacGuard;

  beforeEach(async () => {
    syncService = {
      applyMutations: jest.fn(),
      pull: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SyncController],
      providers: [
        Reflector,
        JwtAuthGuard,
        ClinicScopeGuard,
        RbacGuard,
        { provide: SyncService, useValue: syncService },
      ],
    }).compile();

    controller = module.get(SyncController);
    clinicScopeGuard = module.get(ClinicScopeGuard);
    rbacGuard = module.get(RbacGuard);
  });

  it('rejects unauthenticated sync push attempts', () => {
    const authGuard = createAuthGuard();
    const request: RequestShape = {
      headers: {},
      query: { clinicId: 'clinic-1' },
    };
    const context = createExecutionContext(controller, 'push', request);

    expect(() => authGuard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('returns idempotent push results when guards pass', async () => {
    const authGuard = createAuthGuard();
    const request: RequestShape = {
      headers: { authorization: 'Bearer token', 'user-agent': 'jest' },
      query: { clinicId: 'clinic-1' },
      ip: '127.0.0.1',
    };
    const context = createExecutionContext(controller, 'push', request);
    const appliedResults = [{ id: 'mut-1', status: SYNC_MUTATION_RESULT_STATUS.APPLIED }];

    expect(authGuard.canActivate(context)).toBe(true);
    expect(clinicScopeGuard.canActivate(context)).toBe(true);
    expect(rbacGuard.canActivate(context)).toBe(true);

    syncService.applyMutations.mockResolvedValue(appliedResults);

    await expect(
      controller.push({ clinicId: 'clinic-1' }, mutations, {
        user: request.user!,
        ip: request.ip,
        headers: { 'user-agent': request.headers?.['user-agent'] },
      }),
    ).resolves.toEqual({ results: appliedResults });

    expect(syncService.applyMutations).toHaveBeenCalledWith('clinic-1', request.user, mutations, {
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
    });
  });

  it('returns duplicate-national-id conflicts from the sync service', async () => {
    const authGuard = createAuthGuard();
    const request: RequestShape = {
      headers: { authorization: 'Bearer token' },
      query: { clinicId: 'clinic-1' },
    };
    const context = createExecutionContext(controller, 'push', request);
    const conflictResults = [
      {
        id: 'mut-1',
        status: SYNC_MUTATION_RESULT_STATUS.CONFLICT,
        conflictType: 'DUPLICATE_NATIONAL_ID',
        conflictDetails: {
          existingPatientId: 'existing-1',
          patientCode: 'NKP-2025-000001',
        },
      },
    ];

    expect(authGuard.canActivate(context)).toBe(true);
    expect(clinicScopeGuard.canActivate(context)).toBe(true);
    expect(rbacGuard.canActivate(context)).toBe(true);

    syncService.applyMutations.mockResolvedValue(conflictResults);

    await expect(
      controller.push({ clinicId: 'clinic-1' }, mutations, {
        user: request.user!,
        ip: undefined,
        headers: {},
      }),
    ).resolves.toEqual({ results: conflictResults });
  });

  it('rejects sync push requests without a clinic scope', () => {
    const authGuard = createAuthGuard();
    const request: RequestShape = {
      headers: { authorization: 'Bearer token' },
      query: {},
    };
    const context = createExecutionContext(controller, 'push', request);

    expect(authGuard.canActivate(context)).toBe(true);
    expect(() => clinicScopeGuard.canActivate(context)).toThrow('Clinic scope required');
  });

  it('rejects unauthenticated sync pull attempts', () => {
    const authGuard = createAuthGuard();
    const request: RequestShape = {
      headers: {},
      query: { clinicId: 'clinic-1' },
    };
    const context = createExecutionContext(controller, 'pull', request);

    expect(() => authGuard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('returns pull results when guards pass', async () => {
    const authGuard = createAuthGuard();
    const request: RequestShape = {
      headers: { authorization: 'Bearer token' },
      query: { clinicId: 'clinic-1' },
    };
    const context = createExecutionContext(controller, 'pull', request);
    const pullResult = {
      cursor: '2025-01-01T00:00:00.000Z|last-id',
      patients: [],
      encounters: [],
      vitals: [],
      tobaccoScreenings: [],
      diabetesScreenings: [],
      hypertensionAssessments: [],
      carePlans: [],
      patientConsents: [],
    };

    expect(authGuard.canActivate(context)).toBe(true);
    expect(clinicScopeGuard.canActivate(context)).toBe(true);
    expect(rbacGuard.canActivate(context)).toBe(true);

    syncService.pull.mockResolvedValue(pullResult);

    await expect(controller.pull({ clinicId: 'clinic-1' })).resolves.toEqual(pullResult);
  });

  it('rejects sync pull requests without a clinic scope', () => {
    const authGuard = createAuthGuard();
    const request: RequestShape = {
      headers: { authorization: 'Bearer token' },
      query: {},
    };
    const context = createExecutionContext(controller, 'pull', request);

    expect(authGuard.canActivate(context)).toBe(true);
    expect(() => clinicScopeGuard.canActivate(context)).toThrow('Clinic scope required');
  });
});

describe('sync push body validation', () => {
  const validate = async (body: unknown) =>
    SYNC_PUSH_BODY_PIPE.transform(
      body as never,
      {
        type: 'body',
        metatype: Array,
      } as never,
    );

  const mutation = (overrides: Record<string, unknown> = {}) => ({
    id: '11111111-1111-4111-8111-111111111111',
    entityType: 'vitals',
    entityId: '22222222-2222-4222-8222-222222222222',
    operation: 'UPSERT',
    clinicId: '33333333-3333-4333-8333-333333333333',
    idempotencyKey: 'idem-1',
    ...overrides,
  });

  it('accepts a well-formed mutation', async () => {
    await expect(validate([mutation()])).resolves.toHaveLength(1);
  });

  it('rejects a clinic id that is not a uuid', async () => {
    // Before an explicit pipe, Nest could not infer the element type from the array annotation, so
    // every constraint on SyncMutationDto was declared and never applied.
    await expect(validate([mutation({ clinicId: 'not-a-uuid' })])).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects an entity id that is not a uuid', async () => {
    // entityId is written straight into a primary key.
    await expect(validate([mutation({ entityId: "'; DROP TABLE" })])).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects an unrecognised entity type', async () => {
    await expect(validate([mutation({ entityType: 'clinical_note' })])).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects an unknown property', async () => {
    await expect(validate([mutation({ isAdmin: true })])).rejects.toThrow(BadRequestException);
  });

  it('reports which field failed', async () => {
    await expect(validate([mutation({ clinicId: 'nope' })])).rejects.toMatchObject({
      response: {
        code: 'VALIDATION_ERROR',
        fieldErrors: expect.arrayContaining([expect.objectContaining({ field: 'clinicId' })]),
      },
    });
  });
});
