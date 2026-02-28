import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../app.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SyncService } from './sync.service';
import { UserRole } from '@prisma/client';
import { SYNC_MUTATION_RESULT_STATUS } from './dto/sync-push-response.dto';

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

const createAuthGuard = () => ({
  canActivate: (context: ExecutionContext) => {
    const req = context.switchToHttp().getRequest();
    const auth = req.headers?.authorization;
    if (auth?.startsWith('Bearer ')) {
      req.user = mockUserWithRoles;
      return true;
    }
    throw new UnauthorizedException();
  },
});

describe('SyncController', () => {
  let app: INestApplication;
  let syncService: SyncService;

  const mutations = [
    {
      id: 'mut-1',
      entityType: 'patient',
      entityId: 'patient-1',
      operation: 'UPSERT',
      clinicId: 'clinic-1',
      payloadJson: { nationalId: '123', primaryClinicId: 'clinic-1', firstName: 'J', lastName: 'D' },
      idempotencyKey: 'idem-1',
    },
  ];

  beforeAll(async () => {
    const applyMutationsMock = jest.fn();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(createAuthGuard())
      .overrideProvider(SyncService)
      .useValue({ applyMutations: applyMutationsMock, pull: jest.fn() })
      .compile();

    app = moduleFixture.createNestApplication();
    syncService = moduleFixture.get(SyncService);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /sync/push', () => {
    it('returns 401 without token', () => {
      return request(app.getHttpServer())
        .post('/sync/push?clinicId=clinic-1')
        .send(mutations)
        .expect(401);
    });

    it('returns idempotent results on repeated calls with same idempotency key', async () => {
      const appliedResults = [
        { id: 'mut-1', status: SYNC_MUTATION_RESULT_STATUS.APPLIED },
      ];
      (syncService.applyMutations as jest.Mock).mockResolvedValue(appliedResults);

      const res1 = await request(app.getHttpServer())
        .post('/sync/push?clinicId=clinic-1')
        .set('Authorization', 'Bearer token')
        .send(mutations)
        .expect(200);

      expect(res1.body.results).toEqual(appliedResults);

      (syncService.applyMutations as jest.Mock).mockResolvedValue(appliedResults);

      const res2 = await request(app.getHttpServer())
        .post('/sync/push?clinicId=clinic-1')
        .set('Authorization', 'Bearer token')
        .send(mutations)
        .expect(200);

      expect(res2.body.results).toEqual(appliedResults);
      expect(syncService.applyMutations).toHaveBeenCalledTimes(2);
    });

    it('returns DUPLICATE_NATIONAL_ID conflict when service returns it', async () => {
      (syncService.applyMutations as jest.Mock).mockResolvedValue([
        {
          id: 'mut-1',
          status: SYNC_MUTATION_RESULT_STATUS.CONFLICT,
          conflictType: 'DUPLICATE_NATIONAL_ID',
          conflictDetails: { existingPatientId: 'existing-1', patientCode: 'NKP-2025-000001' },
        },
      ]);

      const res = await request(app.getHttpServer())
        .post('/sync/push?clinicId=clinic-1')
        .set('Authorization', 'Bearer token')
        .send(mutations)
        .expect(200);

      expect(res.body.results).toHaveLength(1);
      expect(res.body.results[0].status).toBe('CONFLICT');
      expect(res.body.results[0].conflictType).toBe('DUPLICATE_NATIONAL_ID');
      expect(res.body.results[0].conflictDetails).toEqual({
        existingPatientId: 'existing-1',
        patientCode: 'NKP-2025-000001',
      });
    });

    it('returns 403 when clinicId query param is missing (clinic scope required)', () => {
      return request(app.getHttpServer())
        .post('/sync/push')
        .set('Authorization', 'Bearer token')
        .send(mutations)
        .expect(403);
    });
  });

  describe('GET /sync/pull', () => {
    beforeAll(() => {
      (syncService.pull as jest.Mock).mockResolvedValue({
        cursor: '2025-01-01T00:00:00.000Z|last-id',
        patients: [],
        encounters: [],
        vitals: [],
        diabetesScreenings: [],
        hypertensionAssessments: [],
        carePlans: [],
        patientConsents: [],
      });
    });

    it('returns 401 without token', () => {
      return request(app.getHttpServer())
        .get('/sync/pull?clinicId=clinic-1')
        .expect(401);
    });

    it('returns pull response with cursor', async () => {
      const res = await request(app.getHttpServer())
        .get('/sync/pull?clinicId=clinic-1')
        .set('Authorization', 'Bearer token')
        .expect(200);

      expect(res.body).toHaveProperty('cursor');
      expect(res.body).toHaveProperty('patients');
      expect(res.body).toHaveProperty('encounters');
    });

    it('returns 403 when clinicId query param is missing (clinic scope required)', () => {
      return request(app.getHttpServer())
        .get('/sync/pull')
        .set('Authorization', 'Bearer token')
        .expect(403);
    });
  });
});
