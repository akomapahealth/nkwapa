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
}

export const CLINIC_NOTES_HEADING = '## For clinic teams';

const RELEASES_URL = 'https://api.github.com/repos/akomapahealth/nkwapa/releases/latest';

/** Used when GitHub cannot be reached at build or revalidation time. Keep it on the latest release. */
export const FALLBACK_RELEASE: Release = {
  version: '2.2.0',
  date: '2026-11-27',
  groups: [
    {
      heading: 'New in 2.2',
      items: [
        {
          lead: 'Register and start, Check in and start.',
          text: 'At registration, Register and start creates the patient, checks them in and opens their first station visit in one step. On the registry and on a chart, Check in and start does the same for a returning patient. If you are not at the first station, the patient is checked in and waits there.',
        },
        {
          lead: 'A day number for each patient.',
          text: 'Every check-in gets the next number for the day: No. 1, No. 2, and so on, starting again each morning. Call "number 14" instead of a name. Nkwapa tells you to write it on their card, and the number leads on queues, boards and the visit.',
        },
        {
          lead: 'Who is already checked in today.',
          text: 'The registry shows "No. 9 · At Glucose" or "Done today" in place of Check in. Trying to check someone in twice says where they are, for example "Already on the line: No. 14 at Glucose, with Ama since 9:42 AM."',
        },
        {
          lead: 'Several blood pressure readings.',
          text: 'Take several readings records up to three readings, with pulse, and fills in the average the WHO way: with three readings, the average of the last two. The blood pressure station now records pulse.',
        },
        {
          lead: 'Red flags travel with the patient.',
          text: 'A crisis blood pressure or a danger glucose shows as Refer today, and a reading to recheck as Repeat at review, on every queue, board and visit along the line. Review lists each flag with its reading, where and when it was taken, and asks before completing a refer-today patient with no referral.',
        },
        {
          lead: 'Ask a doctor.',
          text: "A button on each station visit tells the doctors on shift that a doctor is needed now, or before the patient leaves. The first doctor to press I'm on it takes it. A refer-today reading asks for a doctor automatically at the next station.",
        },
        {
          lead: 'Waiting for review, most urgent first.',
          text: 'At review, the list puts doctor requests and red flags first, then the longest wait, with blood pressure, glucose and BMI on one line. The menu shows how many are waiting.',
        },
        {
          lead: 'Patients held too long.',
          text: 'A patient kept at a station for over 15 minutes (30 at review) is marked on the boards and queues, with a link to open the longest hold. Handing a patient on with nothing recorded asks for a reason first.',
        },
        {
          lead: 'Ready to open.',
          text: 'Managers get a morning checklist on the Today board: stations open, every station staffed, a doctor at review, devices synced, offline access ready and earlier days closed. Copy checklist gives text for the team WhatsApp group.',
        },
        {
          lead: 'End clinic day and the day summary.',
          text: 'Managers press End clinic day to close out the line. Visits stay for doctors to review. The day summary then shows patients seen, referrals, open work, staff on shift and waits per station, with Copy summary and Download CSV. Days left open are closed the next day on their own.',
        },
        {
          lead: 'Practice sessions.',
          text: 'Directors can add up to 20 demo patients from Station setup, check them in to fill the line, and clear them when practice ends. A practice script walks the team through a day. Demo patients carry a Demo tag and stay out of every report.',
        },
        {
          lead: 'A station guide on every visit.',
          text: '"How the station works" opens on each station visit with the steps, the numbers that matter and what to tell the patient next. A print view gives one card per station.',
        },
        {
          lead: 'Station visits keep working offline.',
          text: 'If the connection drops mid-patient, the visit reopens from your device, readings and the eye exam save on it, and the hand-off is sent when the connection returns.',
        },
        {
          lead: 'Report a problem.',
          text: 'From the account menu, or the button on a station visit, tell the team what went wrong. It works offline and sends later. Directors read the reports under Problem reports.',
        },
        {
          lead: 'End shift and sign out.',
          text: 'Signing out while on shift asks whether to end your shift too.',
        },
        {
          lead: 'Keep me signed in.',
          text: 'Tick it at sign-in on your own phone to stay signed in for up to a week of not using the app. Leave it unticked on shared laptops.',
        },
        {
          lead: 'Managers can do more.',
          text: "Managers can do everything a volunteer can, plus review and finalize visits. Their clinical notes still need a doctor's cosign.",
        },
      ],
    },
    {
      heading: 'Improved in 2.2',
      items: [
        {
          lead: 'A simpler sign-in page.',
          text: 'Sign-in and password pages are one short frame with a clinic photo and far fewer words.',
        },
        {
          lead: 'No ID at registration.',
          text: 'Tick No ID with them today to register without a document. The ID type no longer guesses Other, and a number already on another chart says what to do next.',
        },
        {
          lead: 'Chat fits the phone.',
          text: 'Chat no longer cuts off its last row on phones, and the list, messages and send button have a fresh look.',
        },
        {
          lead: 'Faster station line.',
          text: 'Station queues refresh twice as often, and after Complete you go back to your queue with "Patient handed on to" the next station.',
        },
      ],
    },
    {
      heading: 'Fixed in 2.2',
      items: [
        {
          lead: 'Phones stay signed in.',
          text: 'Closing the installed app on a phone no longer signs you out soon after.',
        },
        {
          lead: 'Typing is kept through a connection flicker.',
          text: 'The eye exam and counselling forms no longer lose what you typed when the connection drops and returns.',
        },
        {
          lead: 'Late readings reach review.',
          text: 'A reading saved after the doctor opened the visit now appears with "Added at" and the time, instead of "Not recorded" until the page is reopened.',
        },
        {
          lead: 'The update prompt stops coming back.',
          text: 'After a reload, a waiting update is installed instead of asking again.',
        },
      ],
    },
    {
      heading: 'New in 2.1.6',
      items: [
        {
          lead: 'What to do next after a visit.',
          text: 'When you finalize a visit, a "Visit finalized" panel offers Back to queues to pick up the next patient, or Back to patient. After sending a visit for review, or marking it reviewed, the same choice appears when there is nothing more for you to do on it. Every visit also has a Queues link at the top, next to Back to patient.',
        },
        {
          lead: 'Notifications in the installed app.',
          text: 'When you open Nkwapa as an installed app and notifications are off on that device, it asks once whether to turn them on. It asks again only after you sign out and back in. It never asks in a browser tab, and you can still change this any time in Account.',
        },
      ],
    },
    {
      heading: 'Improved in 2.1.6',
      items: [
        {
          lead: 'Reviewed and finalized visits are easier to read.',
          text: 'In review, sign-off and after finalizing, the Hypertension and Diabetes tabs list each question with the answer that was recorded, instead of a greyed-out form showing every option. Unanswered questions say "Not asked" or "Not recorded". The supervising clinician\'s plan and the classification read the same way.',
        },
      ],
    },
    {
      heading: 'Fixed in 2.1.6',
      items: [
        {
          lead: 'Hypertension and Diabetes tabs no longer shrink.',
          text: 'On a visit in review, waiting for sign-off or finalized, these tabs were squeezed into a narrow column on computers and tablets, so answers broke one letter per line. They now use the full width.',
        },
        {
          lead: 'Adding several volunteers to a screening day.',
          text: 'When you searched for one person, ticked them, then searched for another, only the last person was added. Everyone you tick is now added, and anyone hidden by your current search shows under "Also selected", where you can remove them.',
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
    };
    const version = release.tag_name?.replace(/^v/, '');
    const date = release.published_at?.slice(0, 10);
    if (!version || !date) return FALLBACK_RELEASE;
    const groups = parseClinicNotes(release.body ?? '');
    return { version, date, groups };
  } catch {
    return FALLBACK_RELEASE;
  }
}
