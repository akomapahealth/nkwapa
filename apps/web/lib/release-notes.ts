/**
 * The latest Nkwapa release, for the landing page banner and its "what's new" dialog.
 *
 * Every merge to main publishes a GitHub release (deploy.yml, Tag Release). Its plain-language
 * notes come from a "## For clinic teams" section in the release PR's description, which the job
 * copies into the release body:
 *
 *   ## For clinic teams
 *   ### New
 *   - **Register a patient who has no ID document.** Choose "No ID document" at registration.
 *
 * The landing page refetches hourly, so a new release appears without a code change.
 */

export interface ReleaseNote {
  lead: string;
  text: string;
}

export interface ReleaseGroup {
  heading: string;
  items: ReleaseNote[];
}

export interface Release {
  version: string;
  /** YYYY-MM-DD */
  date: string;
  groups: ReleaseGroup[];
}

export const CLINIC_NOTES_HEADING = '## For clinic teams';

const RELEASES_URL = 'https://api.github.com/repos/akomapahealth/nkwapa/releases/latest';

/** Used when GitHub cannot be reached at build or revalidation time. */
export const FALLBACK_RELEASE: Release = {
  version: '1.2.0',
  date: '2026-10-12',
  groups: [
    {
      heading: 'New',
      items: [
        {
          lead: 'Register a patient who has no ID document.',
          text: 'Choose “No ID document” at registration. Their name, date of birth and phone number are then used to spot a possible duplicate record.',
        },
        {
          lead: 'Add or correct an ID later.',
          text: 'An ID can be added to a record after registration, or fixed if it was entered wrongly. Each change asks for a reason and is kept in the record’s history.',
        },
      ],
    },
    {
      heading: 'Improved',
      items: [
        {
          lead: 'Imported screening visits are flagged for review.',
          text: 'Visits brought in from a screening spreadsheet are now marked for a doctor to review when a reading needs attention, such as low blood sugar or very high blood pressure.',
        },
      ],
    },
    {
      heading: 'Fixed',
      items: [
        {
          lead: 'Duplicate IDs no longer fail silently.',
          text: 'Registering an ID that was already on another record used to stop with no message. Nkwapa now shows the record that already has it.',
        },
      ],
    },
  ],
};

/** Reads the "## For clinic teams" section of a release body. Anything else is ignored. */
export function parseClinicNotes(body: string): ReleaseGroup[] {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === CLINIC_NOTES_HEADING);
  if (start < 0) return [];

  const groups: ReleaseGroup[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^## /.test(line)) break;
    const heading = line.match(/^### +(.+?)\s*$/);
    if (heading) {
      groups.push({ heading: heading[1], items: [] });
      continue;
    }
    const item = line.match(/^\s*[-*] +\*\*(.+?)\*\*\s*(.*?)\s*$/);
    if (item && groups.length)
      groups[groups.length - 1].items.push({ lead: item[1], text: item[2] });
  }
  return groups.filter((group) => group.items.length > 0);
}

export async function getLatestRelease(): Promise<Release> {
  try {
    const response = await fetch(RELEASES_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        // Optional: lifts the shared 60-requests-an-hour limit build machines can hit.
        ...(process.env.GITHUB_TOKEN
          ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
          : {}),
      },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return FALLBACK_RELEASE;
    const release = (await response.json()) as {
      tag_name?: string;
      published_at?: string;
      body?: string | null;
    };
    const version = release.tag_name?.replace(/^v/, '');
    const date = release.published_at?.slice(0, 10);
    if (!version || !date) return FALLBACK_RELEASE;
    const groups = parseClinicNotes(release.body ?? '');
    // v1.2.0 was published before releases carried a clinic section.
    if (!groups.length && version === FALLBACK_RELEASE.version) return FALLBACK_RELEASE;
    return { version, date, groups };
  } catch {
    return FALLBACK_RELEASE;
  }
}
