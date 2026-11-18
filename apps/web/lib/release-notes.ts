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
  version: '2.1.1',
  date: '2026-11-18',
  groups: [
    {
      heading: 'New in 2.1.1',
      items: [
        {
          lead: 'Volunteers sign a confidentiality agreement.',
          text: 'Before using Nkwapa, a volunteer reads nine short points, ticks a box and types their name to sign. Existing volunteers are asked the next time they open the app. Your account page shows when you signed, with a link to read it again.',
        },
        {
          lead: 'A notice when your role changes.',
          text: 'When an administrator gives you a new role or removes one, Nkwapa tells you what changed. If you have no access left, it says so.',
        },
        {
          lead: 'Search and filter a queue.',
          text: 'Find a patient in a queue by name or patient code, even if they are not on the first page. Filter by blood pressure class, high glucose or the dates a visit was created.',
        },
        {
          lead: 'The patient at a glance.',
          text: "The chart Overview opens with the patient's conditions, latest blood pressure and glucose with their direction, medications and adherence, and risks such as allergies and tobacco.",
        },
        {
          lead: 'Full middle names.',
          text: 'Patients and staff can have a full middle name, not just an initial. Existing initials are kept.',
        },
        {
          lead: 'Where a patient lives.',
          text: "Record a patient's Digital Address, a landmark and their home's position on a map.",
        },
        {
          lead: 'A password-protected referral report.',
          text: "Doctors, volunteers and managers can make a PDF referral report for a patient, choose what goes in it, and download or email it. The PDF opens with a 16-character passcode. A patient's referral consent is recorded on the Consent tab, separately from research consent.",
        },
        {
          lead: 'A welcome tour for each role.',
          text: 'A short tour shows each role where its work lives. On a phone it appears as a centred dialog.',
        },
        {
          lead: 'A second sign-in step.',
          text: 'In Settings, staff can add an authenticator app or a passkey, so signing in asks for it after the password. System administrators must set one up.',
        },
      ],
    },
    {
      heading: 'Improved in 2.1.1',
      items: [
        {
          lead: 'The dashboard when you are offline.',
          text: 'Instead of an error, the dashboard says its figures need a connection, shows what still works offline, and keeps any figures already on screen with the time they were loaded.',
        },
      ],
    },
    {
      heading: 'Fixed in 2.1.1',
      items: [
        {
          lead: 'Research exports open safely in spreadsheets.',
          text: 'A value that starts like a spreadsheet formula is now exported as plain text.',
        },
      ],
    },
    {
      heading: 'New in 2.1',
      items: [
        {
          lead: 'A refreshed workspace for every role.',
          text: 'Volunteers, doctors, managers, directors and patients each open on their own work first. The menu fits the screen: a side menu on a computer, a slim rail on a tablet and a bar along the bottom on a phone, with the rest under More.',
        },
        {
          lead: 'Review-station notes without choosing a doctor.',
          text: 'A volunteer at the review station can submit a note without picking a doctor first. Any doctor at the clinic can cosign it. A note assigned to a named doctor still stays with that doctor.',
        },
        {
          lead: 'A notice when your screening save is replaced.',
          text: "If a colleague's offline save replaces blood pressure, diabetes or vitals answers you saved more recently, you get a notice in Notifications that opens the visit. Their save still goes through, so nobody is blocked.",
        },
        {
          lead: 'A preview on each clinical note.',
          text: 'The notes list in a patient record shows the first lines of each note, so you can find the right one without opening them all.',
        },
      ],
    },
    {
      heading: 'Improved in 2.1',
      items: [
        {
          lead: 'Clearer screening and clinical forms.',
          text: 'The blood pressure and diabetes interviews and the clinical forms show which section you are in and whether your answers are saved.',
        },
        {
          lead: 'Signing asks you to confirm.',
          text: 'Signing a note and finalizing a visit ask once before they happen.',
        },
        {
          lead: 'The patient portal fits phones better.',
          text: 'The header and bottom bar adjust to the screen, and long appointment titles wrap instead of being cut off when text is enlarged.',
        },
        {
          lead: 'Saved changes say what they are waiting for.',
          text: 'The sync list separates changes that are waiting, changes that need your attention and changes you can retry.',
        },
        {
          lead: 'Settings on one page.',
          text: "Your settings sit in one readable column, with links to notifications, installing the app and your clinic's details.",
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
