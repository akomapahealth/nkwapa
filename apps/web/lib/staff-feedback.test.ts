import { maskRoute, staffFeedbackCategoryLabel } from './staff-feedback';

describe('maskRoute', () => {
  it.each([
    ['/stations/visits/7d0d7a1c-5d5c-4d7f-9a43-0f3e2b6c1a11', '/stations/visits/:id'],
    [
      '/patients/3f2a9c10-1111-4222-8333-444455556666/encounters/abc123',
      '/patients/:id/encounters/:id',
    ],
    ['/stations?visit=7d0d7a1c#top', '/stations'],
    ['/today', '/today'],
    ['/', '/'],
  ])('%s becomes %s', (input, expected) => {
    expect(maskRoute(input)).toBe(expected);
  });
});

it('names a category the way the dialog does', () => {
  expect(staffFeedbackCategoryLabel('NOT_SAVED')).toBe('Something did not save');
  expect(staffFeedbackCategoryLabel('UNKNOWN')).toBe('UNKNOWN');
});
