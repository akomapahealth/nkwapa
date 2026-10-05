import { getAccessibleNavSections, isNavItemActive, type AppNavItem } from './app-nav';
import type { WhoAmIResponse } from './bootstrap-context';

function bootstrapAs(roles: string[], permissions: string[], globalRoles: string[] = []) {
  return {
    userId: 'user-1',
    keycloakSub: 'sub-1',
    displayName: 'Ama',
    memberships: [{ clinicId: 'clinic-1', clinicName: 'Nkwapa Clinic', roles }],
    availableClinics: [{ clinicId: 'clinic-1', clinicName: 'Nkwapa Clinic' }],
    globalRoles,
    activeClinicId: 'clinic-1',
    effectiveRolesForActiveClinic: roles,
    effectivePermissionsForActiveClinic: permissions,
    onboarding: null,
  } as WhoAmIResponse;
}

function hrefsFor(bootstrap: WhoAmIResponse): string[] {
  return getAccessibleNavSections(bootstrap).flatMap((section) =>
    section.items.map((item) => item.href),
  );
}

const CROSS_CLINIC = '/admin/duplicates/cross-clinic';

describe('the cross-clinic duplicates link', () => {
  it('is shown to a system administrator', () => {
    expect(hrefsFor(bootstrapAs([], ['*'], ['SYSTEM_ADMIN']))).toContain(CROSS_CLINIC);
  });

  /*
    A director holds duplicate review at their own clinic, so the permission alone would show the
    link. The API refuses them anything spanning clinics, and a link that only leads to a refusal
    is worse than none.
  */
  it('is hidden from a director who can review their own clinic', () => {
    const hrefs = hrefsFor(
      bootstrapAs(['DIRECTOR'], ['PATIENT.DUPLICATE.REVIEW', 'CLINIC.MANAGE']),
    );
    expect(hrefs).toContain('/admin/duplicates');
    expect(hrefs).not.toContain(CROSS_CLINIC);
  });

  it('is hidden from a clinical role', () => {
    expect(hrefsFor(bootstrapAs(['DOCTOR'], ['PATIENT.READ']))).not.toContain(CROSS_CLINIC);
  });
});

describe('isNavItemActive', () => {
  const item = (href: string): AppNavItem =>
    getAccessibleNavSections(bootstrapAs([], ['*'], ['SYSTEM_ADMIN']))
      .flatMap((section) => section.items)
      .find((candidate) => candidate.href === href) as AppNavItem;

  it('marks exactly one item current on a nested destination', () => {
    expect(isNavItemActive(CROSS_CLINIC, item(CROSS_CLINIC), 'clinic-1')).toBe(true);
    expect(isNavItemActive(CROSS_CLINIC, item('/admin/duplicates'), 'clinic-1')).toBe(false);
  });

  it('still marks the parent current on its own page and on pages below it with no item', () => {
    expect(isNavItemActive('/admin/duplicates', item('/admin/duplicates'), 'clinic-1')).toBe(true);
    expect(isNavItemActive('/admin/users/abc', item('/admin/users'), 'clinic-1')).toBe(true);
  });

  it('compares clinic-scoped destinations by the href they resolve to', () => {
    const patients = item('/patients');
    expect(isNavItemActive('/clinics/clinic-1/patients/p-1', patients, 'clinic-1')).toBe(true);
    expect(isNavItemActive('/clinics/clinic-1/patients/new', patients, 'clinic-1')).toBe(false);
  });

  it('does not treat a shared prefix as nesting', () => {
    expect(isNavItemActive('/admin/duplicates-old', item('/admin/duplicates'), 'clinic-1')).toBe(
      false,
    );
  });
});
