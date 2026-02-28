import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../app.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { ClinicService } from './clinic.service';
import { UserRole } from '@prisma/client';

const mockUserWithClinicAccess = {
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

const mockUserWithoutClinicAccess = {
  user: { id: 'user-2', keycloakSub: 'other-sub', displayName: 'Other', email: null as string | null, phoneE164: null as string | null, isActive: true, createdAt: new Date(), updatedAt: new Date() },
  roles: [{ clinicId: 'other-clinic', role: UserRole.VOLUNTEER }],
};

const mockClinic = {
  id: 'clinic-1',
  name: 'Test Clinic',
  region: 'Test Region',
  countryCode: 'GH',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const createAuthGuard = (user: { user: unknown; roles: unknown[] }) => ({
  canActivate: (context: ExecutionContext) => {
    const req = context.switchToHttp().getRequest();
    const auth = req.headers?.authorization;
    if (auth?.startsWith('Bearer ')) {
      req.user = user;
      return true;
    }
    throw new UnauthorizedException();
  },
});

describe('ClinicsController', () => {
  let app: INestApplication;
  let clinicService: ClinicService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(createAuthGuard(mockUserWithClinicAccess))
      .overrideProvider(ClinicService)
      .useValue({
        findById: jest.fn().mockImplementation((id: string) => {
          if (id === 'clinic-1') return Promise.resolve(mockClinic);
          return Promise.resolve(null);
        }),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    clinicService = moduleFixture.get(ClinicService);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /clinics/:id', () => {
    it('returns 401 without token', () => {
      return request(app.getHttpServer())
        .get('/clinics/clinic-1')
        .expect(401);
    });

    it('returns 200 with valid token and clinic access (SYSTEM_ADMIN)', async () => {
      const res = await request(app.getHttpServer())
        .get('/clinics/clinic-1')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(res.body).toHaveProperty('id', 'clinic-1');
      expect(res.body).toHaveProperty('name', 'Test Clinic');
    });

    it('returns 404 for non-existent clinic', () => {
      return request(app.getHttpServer())
        .get('/clinics/non-existent')
        .set('Authorization', 'Bearer valid-token')
        .expect(404);
    });
  });
});

describe('ClinicsController - no clinic access', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(createAuthGuard(mockUserWithoutClinicAccess))
      .overrideProvider(ClinicService)
      .useValue({
        findById: jest.fn().mockResolvedValue(mockClinic),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 403 when user has no access to clinic', () => {
    return request(app.getHttpServer())
      .get('/clinics/clinic-1')
      .set('Authorization', 'Bearer valid-token')
      .expect(403);
  });
});
