import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../app.module';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ClinicService } from '../clinics/clinic.service';
import { UserRole } from '@prisma/client';

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

const mockJwtAuthGuard = {
  canActivate: (context: ExecutionContext) => {
    const req = context.switchToHttp().getRequest();
    const auth = req.headers?.authorization;
    if (auth?.startsWith('Bearer ')) {
      req.user = mockUserWithRoles;
      return true;
    }
    throw new UnauthorizedException();
  },
};

describe('AuthController', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .overrideProvider(ClinicService)
      .useValue({
        findByIds: jest.fn().mockResolvedValue([
          { id: 'clinic-1', name: 'Test Clinic', region: 'Test Region' },
        ]),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /auth/me', () => {
    it('returns 401 without token', () => {
      return request(app.getHttpServer())
        .get('/auth/me')
        .expect(401);
    });

    it('returns 401 with non-Bearer auth header', () => {
      return request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', 'Basic foo')
        .expect(401);
    });

    it('returns user and roles with valid Bearer token', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(res.body).toHaveProperty('user');
      expect(res.body.user).toHaveProperty('id', 'user-1');
      expect(res.body.user).toHaveProperty('displayName', 'Test User');
      expect(res.body).toHaveProperty('roles');
      expect(Array.isArray(res.body.roles)).toBe(true);
    });
  });

  describe('GET /auth/whoami', () => {
    it('returns bootstrap response with valid Bearer token', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/whoami')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(res.body).toHaveProperty('userId', 'user-1');
      expect(res.body).toHaveProperty('keycloakSub', 'test-sub');
      expect(res.body).toHaveProperty('displayName', 'Test User');
      expect(res.body).toHaveProperty('memberships');
      expect(Array.isArray(res.body.memberships)).toBe(true);
      expect(res.body.memberships[0]).toMatchObject({
        clinicId: 'clinic-1',
        clinicName: 'Test Clinic',
        roles: expect.any(Array),
      });
      expect(res.body).toHaveProperty('globalRoles');
      expect(res.body.globalRoles).toContain('SYSTEM_ADMIN');
      expect(res.body).toHaveProperty('activeClinicId');
      expect(res.body).toHaveProperty('effectiveRolesForActiveClinic');
      expect(Array.isArray(res.body.effectiveRolesForActiveClinic)).toBe(true);
      expect(res.body).toHaveProperty('effectivePermissionsForActiveClinic');
      expect(Array.isArray(res.body.effectivePermissionsForActiveClinic)).toBe(true);
    });

    it('uses X-Clinic-Id header when user has membership', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/whoami')
        .set('Authorization', 'Bearer valid-token')
        .set('X-Clinic-Id', 'clinic-1')
        .expect(200);

      expect(res.body.activeClinicId).toBe('clinic-1');
    });
  });
});
