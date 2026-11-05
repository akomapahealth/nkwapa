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
  version: '2.0.0',
  date: '2026-11-05',
  groups: [
    {
      heading: 'New',
      items: [
        {
          lead: 'A new look across Nkwapa.',
          text: 'Every staff page, the patient portal, the sign-in pages and the home page now share one calm layout: clear headings, numbers first, and teal only on what you can press. What you record, and how it is saved, has not changed.',
        },
        {
          lead: '"Needs you now" at the top of every dashboard.',
          text: "Volunteers, doctors, managers, directors and admins each see the work waiting for them first, with one button for each item, before today's counts and trends.",
        },
        {
          lead: 'See how long patients have waited.',
          text: "On the Today board and the manager dashboard each station is a lane, and each patient's bar grows with the minutes they have waited. Waits over 20 minutes are marked in words as well as colour, and a station with nobody on it says so.",
        },
        {
          lead: 'A table under every chart.',
          text: 'Every dashboard and report chart has a table switch, so you can read the exact numbers instead of estimating them from a line.',
        },
        {
          lead: 'A week view for appointments.',
          text: 'Appointments open on a seven-day strip; choose a day to see its visits. Times are shown in Ghana time and the page says so.',
        },
        {
          lead: 'A side menu you can fold away.',
          text: 'Fold the side menu down to icons for more room, with its button or the `[` key. Point at or tab to an icon to see its name.',
        },
      ],
    },
    {
      heading: 'Improved',
      items: [
        {
          lead: 'Message delivery and Clinic settings have moved.',
          text: 'Message delivery (formerly Notifications) is the send icon at the top of the page, and Clinic settings is in your account menu. The pages and who can open them are the same.',
        },
        {
          lead: 'Setting up an account is one clear journey.',
          text: 'From the invitation email to the first sign-in, each screen says which step you are on, and an expired or already-used link explains what happened and what to do next.',
        },
        {
          lead: 'The patient portal works better on phones.',
          text: 'Three main buttons along the bottom, one "Request an appointment" button, and your readings as a table as well as a chart.',
        },
        {
          lead: 'Clearer queues and sign-off.',
          text: "Each queue shows its count once, a visit's stage is written in words, and Finalize, Sign note and Cosign note look different from Save.",
        },
        {
          lead: 'Corrections stay visible.',
          text: 'A cancelled station stop or appointment time is crossed out, with who changed it and when, instead of disappearing.',
        },
        {
          lead: 'Honest screens when the connection drops.',
          text: 'A list that could not load says so instead of looking empty, a saved copy is marked as possibly out of date, and changes waiting to sync stay on screen. The top of the page says "Review saved changes" while anything is waiting.',
        },
        {
          lead: 'Easier to use on phones and tablets.',
          text: "Buttons and links are bigger, wide tables scroll inside their own box, and side panels stay clear of the phone's notch.",
        },
        {
          lead: 'Forms show their problems first.',
          text: 'When a form cannot be saved, a list of what to fix appears at the top, and screen readers announce error messages straight away.',
        },
        {
          lead: 'A shorter, calmer home page.',
          text: "Fewer words, real Akomapa photographs, and a What's New list that stays readable as releases grow.",
        },
        {
          lead: 'Faster, steadier text.',
          text: "Nkwapa's fonts now load from Nkwapa itself instead of an outside service.",
        },
      ],
    },
    {
      heading: 'Fixed',
      items: [
        {
          lead: 'The Sex field at patient registration',
          text: 'now has a proper label, so screen readers name it.',
        },
        {
          lead: 'Hard-to-read text',
          text: 'in the patient portal and on the home page now has enough contrast.',
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
