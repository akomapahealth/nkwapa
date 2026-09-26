import {
  ALL_ORGANIZATIONS_VALUE,
  adminClinicsQuery,
  adminUsersPath,
  organizationFilterFromSelect,
  organizationFilterLabel,
  organizationFilterOptions,
  organizationFilterToSelect,
  shouldOfferOrganizationFilter,
} from './organization-filter';

const ORGS = [
  {
    id: 'org-a',
    name: 'Akomapa Health',
    slug: 'akomapa',
    timezone: 'Africa/Accra',
    clinicCount: 3,
  },
  {
    id: 'org-b',
    name: 'Coastal Partners',
    slug: 'coastal',
    timezone: 'Africa/Accra',
    clinicCount: 1,
  },
];

describe('organization filter', () => {
  // With one organization, "that one" and "all" are the same view.
  it('is offered only when there is a choice to make', () => {
    expect(shouldOfferOrganizationFilter([ORGS[0]])).toBe(false);
    expect(shouldOfferOrganizationFilter(ORGS)).toBe(true);
  });

  it('leads with "all" and shows each organization with its clinic count', () => {
    expect(organizationFilterOptions(ORGS)).toEqual([
      { value: ALL_ORGANIZATIONS_VALUE, label: 'All organizations' },
      { value: 'org-a', label: 'Akomapa Health (3)' },
      { value: 'org-b', label: 'Coastal Partners (1)' },
    ]);
  });

  it('round-trips through the select value', () => {
    expect(organizationFilterFromSelect(organizationFilterToSelect(null))).toBeNull();
    expect(organizationFilterFromSelect(organizationFilterToSelect('org-b'))).toBe('org-b');
  });

  it('names the applied filter, and nothing when unfiltered', () => {
    expect(organizationFilterLabel(ORGS, null)).toBeNull();
    expect(organizationFilterLabel(ORGS, 'org-b')).toBe('Coastal Partners');
  });

  // The URL fetched and the key it is cached under come from one place and so cannot disagree.
  it('changes the clinic query and its cache key together', () => {
    expect(adminClinicsQuery(null, null)).toEqual({
      path: '/admin/clinics',
      resourceKey: 'admin-clinics:all:all',
    });
    const filtered = adminClinicsQuery('north', 'org-a');
    expect(filtered.path).toBe('/admin/clinics?zoneCode=north&organizationId=org-a');
    expect(filtered.resourceKey).toBe('admin-clinics:north:org-a');
  });

  it('adds the organization to the users query only when set', () => {
    expect(adminUsersPath('active', null)).toBe('/admin/users?status=active');
    expect(adminUsersPath('all', 'org-a')).toBe('/admin/users?status=all&organizationId=org-a');
  });
});
