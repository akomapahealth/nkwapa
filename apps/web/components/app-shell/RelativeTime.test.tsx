/**
 * @jest-environment node
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { RelativeTime } from './RelativeTime';

const NOW = Date.parse('2026-11-12T12:00:00.000Z');
const render = (value: string) => renderToStaticMarkup(createElement(RelativeTime, { value }));

describe('RelativeTime', () => {
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW));
  afterEach(() => jest.restoreAllMocks());

  it('reads relative within the week and keeps the exact clinic time in the title', () => {
    const html = render('2026-11-12T11:48:00.000Z');
    expect(html).toContain('>12 min ago<');
    expect(html).toContain('dateTime="2026-11-12T11:48:00.000Z"');
    expect(html).toMatch(/title="Nov 12, 11:48/);
  });

  it('falls back to the clinic date past a week and for future times', () => {
    expect(render('2026-11-01T09:00:00.000Z')).toMatch(/>Nov 1, 9:00/);
    expect(render('2026-11-13T09:00:00.000Z')).toMatch(/>Nov 13, 9:00/);
  });

  it('renders nothing for an unreadable time', () => {
    expect(render('not a date')).toBe('');
  });
});
