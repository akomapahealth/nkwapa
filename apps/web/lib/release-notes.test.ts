import { parseClinicNotes } from './release-notes';

describe('parseClinicNotes', () => {
  it('reads groups and items from the clinic section only', () => {
    const body = [
      '## For clinic teams',
      '### New',
      '- **Register without an ID.** Choose "No ID document".',
      '- **Add an ID later.**',
      '',
      '### Fixed',
      '* **Duplicate IDs show a message.** It used to fail silently.',
      '',
      "## What's Changed",
      '* ci: publish releases by @someone in #217',
    ].join('\r\n');

    expect(parseClinicNotes(body)).toEqual([
      {
        heading: 'New',
        items: [
          { lead: 'Register without an ID.', text: 'Choose "No ID document".' },
          { lead: 'Add an ID later.', text: '' },
        ],
      },
      {
        heading: 'Fixed',
        items: [{ lead: 'Duplicate IDs show a message.', text: 'It used to fail silently.' }],
      },
    ]);
  });

  it('returns nothing without the section, and drops empty groups', () => {
    expect(parseClinicNotes("## What's Changed\n* fix: something")).toEqual([]);
    expect(parseClinicNotes('## For clinic teams\n### New\n\n### Fixed\n- plain line')).toEqual([]);
  });
});
