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
 * The landing page refetches every five minutes, so a new release appears without a code change.
 * The web deploy finishes before the release is tagged, so a fresh build still shows the previous
 * version until the next refetch.
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
  /** The GitHub release page, when known. */
  url?: string;
}

export const CLINIC_NOTES_HEADING = '## For clinic teams';

const RELEASES_URL = 'https://api.github.com/repos/akomapahealth/nkwapa/releases/latest';

/** Used when GitHub cannot be reached at build or revalidation time. Keep it on the latest release. */
export const FALLBACK_RELEASE: Release = {
  version: '1.4.0',
  date: '2026-10-29',
  groups: [
    {
      heading: 'New',
      items: [
        {
          lead: 'A volunteer directory and screening-day rosters.',
          text: 'Managers and directors can keep their clinic’s volunteers in Nkwapa, with or without an account, plan each screening day, put volunteers on its roster, and email them the details. If a day changes or is cancelled, the people on the roster are told.',
        },
        {
          lead: 'Record who actually screened.',
          text: 'When a volunteer works a station on someone else’s account, they can say who is really screening. That name shows on the board, the visit timeline and the review note, and can be corrected afterwards.',
        },
        {
          lead: 'Find patients by screening date.',
          text: 'The patient registry can show everyone who completed a screening on a given day or between two dates, ready for follow-up.',
        },
        {
          lead: 'System status at the bottom of the home page.',
          text: 'A dot shows whether Nkwapa is working normally. Open it for each part and a report you can copy.',
        },
      ],
    },
    {
      heading: 'Improved',
      items: [
        {
          lead: 'Staff names instead of email addresses.',
          text: 'Every staff account now has a first name, last name and optional middle initial. Names, not emails, show on boards, timelines and notes.',
        },
        {
          lead: 'Closing a station frees the volunteers working there.',
          text: 'They are asked to choose another station and told why.',
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
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return FALLBACK_RELEASE;
    const release = (await response.json()) as {
      tag_name?: string;
      published_at?: string;
      body?: string | null;
      html_url?: string;
    };
    const version = release.tag_name?.replace(/^v/, '');
    const url = release.html_url;
    const date = release.published_at?.slice(0, 10);
    if (!version || !date) return FALLBACK_RELEASE;
    const groups = parseClinicNotes(release.body ?? '');
    return { version, date, groups, url };
  } catch {
    return FALLBACK_RELEASE;
  }
}
