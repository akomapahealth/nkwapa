import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PERMISSIONS, ROLE_PERMISSIONS } from '../auth/constants/permissions';
import { REQUIRE_PERMISSION_KEY } from '../auth/decorators/require-permission.decorator';
import { PracticeController } from './practice.controller';
import { AddPracticePatientsDto } from './practice.dto';
import { practicePatient } from './practice.service';

describe('practice sessions (#410)', () => {
  it('gates every route on PATIENT.DEMO.MANAGE, which volunteers and managers lack', () => {
    const reflector = new Reflector();
    for (const route of ['summary', 'add', 'clear'] as const) {
      expect(reflector.get(REQUIRE_PERMISSION_KEY, PracticeController.prototype[route])).toBe(
        PERMISSIONS.PATIENT_DEMO_MANAGE,
      );
    }
    expect(ROLE_PERMISSIONS[UserRole.DIRECTOR]).toContain(PERMISSIONS.PATIENT_DEMO_MANAGE);
    for (const role of [UserRole.VOLUNTEER, UserRole.MANAGER, UserRole.DOCTOR]) {
      expect(ROLE_PERMISSIONS[role]).not.toContain(PERMISSIONS.PATIENT_DEMO_MANAGE);
    }
  });

  it.each([
    [1, true],
    [20, true],
    [0, false],
    [21, false],
    [2.5, false],
    ['10', false],
  ])('count %p is valid: %p', (count, valid) => {
    const dto = plainToInstance(AddPracticePatientsDto, { count, checkIn: true });
    expect(validateSync(dto).length === 0).toBe(valid);
  });

  it('names every chart "Demo …" and keeps ages from 25 to 75', () => {
    const now = new Date('2026-11-25T12:00:00Z');
    const youngest = practicePatient(0, now, () => 0);
    const oldest = practicePatient(1, now, () => 0.9999);
    expect(youngest).toMatchObject({ firstName: 'Kwabena', lastName: 'Demo Mensah', sex: 'MALE' });
    expect(oldest.lastName).toBe('Demo Frimpong');
    expect(youngest.dob.toISOString()).toBe('2001-11-25T00:00:00.000Z');
    expect(oldest.dob.getUTCFullYear()).toBe(1950);
    expect(oldest.dob > new Date('1949-11-25T00:00:00Z')).toBe(true);
  });
});
