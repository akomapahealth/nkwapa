import {
  TENANT_CLINICAL_ROLES,
  TENANT_CLINICS,
  TENANT_CROSS_CLINIC_USERS,
  TENANT_ORGANIZATIONS,
  TENANT_PATIENTS,
  TENANT_USERS,
  tenantFixtureSql,
  tenantUser,
} from './tenant-fixture';

describe('tenant fixture', () => {
  it('spans two organizations so cross-tenant isolation is observable', () => {
    const organizationIds = new Set(Object.values(TENANT_CLINICS).map((c) => c.organizationId));
    expect(organizationIds.size).toBe(2);
    expect(organizationIds).toContain(TENANT_ORGANIZATIONS.orgA.id);
    expect(organizationIds).toContain(TENANT_ORGANIZATIONS.orgB.id);
  });

  it('places two clinics in one organization so clinic isolation is separable from tenancy', () => {
    expect(TENANT_CLINICS.a1.organizationId).toBe(TENANT_CLINICS.a2.organizationId);
    expect(TENANT_CLINICS.b1.organizationId).not.toBe(TENANT_CLINICS.a1.organizationId);
  });

  it('seats every clinical role at every clinic', () => {
    for (const clinicKey of ['a1', 'a2', 'b1'] as const) {
      for (const role of TENANT_CLINICAL_ROLES) {
        const user = tenantUser(clinicKey, role);
        expect(user.roles).toEqual([{ clinicId: TENANT_CLINICS[clinicKey].id, role }]);
      }
    }
  });

  it('includes a user whose roles span clinics', () => {
    // Without this shape, a permission check that reads the whole role array instead of the roles
    // held at the target clinic looks correct in every single-clinic test.
    const crossing = TENANT_CROSS_CLINIC_USERS.managerAtA1VolunteerAtB1;
    expect(crossing.roles).toEqual([
      { clinicId: TENANT_CLINICS.a1.id, role: 'MANAGER' },
      { clinicId: TENANT_CLINICS.b1.id, role: 'VOLUNTEER' },
    ]);
  });

  it('keeps every identifier unique', () => {
    const ids = [
      ...Object.values(TENANT_ORGANIZATIONS).map((o) => o.id),
      ...Object.values(TENANT_CLINICS).map((c) => c.id),
      ...TENANT_USERS.map((u) => u.id),
      ...Object.values(TENANT_PATIENTS).map((p) => p.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);

    const subs = TENANT_USERS.map((u) => u.keycloakSub);
    expect(new Set(subs).size).toBe(subs.length);
  });

  it('emits insert statements for every fixture row', () => {
    const sql = tenantFixtureSql();
    const inserts = sql.split('\n').filter((line) => line.startsWith('INSERT'));
    const expectedRoleGrants = TENANT_USERS.reduce((total, user) => total + user.roles.length, 0);

    expect(inserts).toHaveLength(
      Object.keys(TENANT_ORGANIZATIONS).length +
        Object.keys(TENANT_CLINICS).length +
        TENANT_USERS.length +
        expectedRoleGrants +
        Object.keys(TENANT_PATIENTS).length,
    );
    // Plain inserts, not upserts: a fixture collision must fail loudly.
    expect(sql).not.toMatch(/ON CONFLICT/i);
  });

  it('leaves every SQL string literal balanced', () => {
    // An unescaped quote inside a fixture value would close its literal early and turn the rest of
    // the statement into syntax, so each statement must carry an even number of quote characters.
    for (const statement of tenantFixtureSql().split('\n')) {
      const quotes = statement.match(/'/g)?.length ?? 0;
      expect(quotes % 2).toBe(0);
    }
  });
});
