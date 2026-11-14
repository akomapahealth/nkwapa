import type { WhoAmIResponse } from './bootstrap-context';
import { formatStaffRole } from './staff-invite';

/**
 * The welcome tour: a short first-run introduction, once per person.
 *
 * Not onboarding. "Onboarding" in this codebase means the account steps that gate the app
 * (claiming a patient record, accepting a staff invitation); the tour gates nothing and is offered
 * only after those are done.
 *
 * Bump the version when the tour changes enough to be worth showing again. The server stores the
 * last version each person finished or skipped, and the tour is offered while that is lower.
 * #277 rewrote the content but kept version 1 on purpose: re-offering it would put a modal in
 * front of every existing user on their next visit, and the tour stays one click away in the
 * user menu for anyone who wants the new one.
 */
export const CURRENT_WELCOME_TOUR_VERSION = 1;

/** Fired on `window` to open the tour on demand, from the user menu. */
export const WELCOME_TOUR_OPEN_EVENT = 'nkwapa:welcome-tour:open';

export type WelcomeTourIcon =
  | 'welcome'
  | 'navigation'
  | 'clinic'
  | 'start'
  | 'offline'
  | 'help'
  | 'health'
  | 'appointments'
  | 'work';

/** One thing to try, and where it is. */
export interface WelcomeTourPoint {
  label: string;
  where: string;
}

export interface WelcomeTourStep {
  id: string;
  icon: WelcomeTourIcon;
  title: string;
  body: string;
  points?: WelcomeTourPoint[];
}

export type WelcomeTourAudience = 'staff' | 'patient';

export function welcomeTourAudience(bootstrap: WhoAmIResponse): WelcomeTourAudience {
  const roles = new Set([
    ...bootstrap.globalRoles,
    ...bootstrap.memberships.flatMap((membership) => membership.roles),
  ]);
  return roles.size > 0 && [...roles].every((role) => role === 'PATIENT') ? 'patient' : 'staff';
}

/** Whether to offer the tour now, without being asked. */
export function shouldOfferWelcomeTour(bootstrap: WhoAmIResponse | null): boolean {
  if (!bootstrap) return false;
  // Account steps come first and own the screen until they are done.
  if (bootstrap.onboarding) return false;
  // An older API that does not report the tour: never offer it rather than offering it forever.
  if (!bootstrap.welcomeTour) return false;
  const completed = bootstrap.welcomeTour.completedVersion ?? 0;
  return completed < CURRENT_WELCOME_TOUR_VERSION;
}

function hasPermission(bootstrap: WhoAmIResponse, permission: string): boolean {
  const granted = bootstrap.effectivePermissionsForActiveClinic;
  return granted.includes('*') || granted.includes(permission);
}

/**
 * Where this person's day starts, in one sentence. Chosen by what they can open, the same way the
 * sidebar is, so the tour never points at a page someone cannot reach.
 */
function startStep(
  bootstrap: WhoAmIResponse,
  { stationWorkflow }: { stationWorkflow: boolean },
): WelcomeTourStep {
  if (hasPermission(bootstrap, 'OPS.CHECKIN.READ')) {
    return {
      id: 'start',
      icon: 'start',
      title: 'Your day starts on the Today board',
      body: 'See who is on shift, who has arrived, and who is still waiting, all refreshing on their own.',
    };
  }
  if (stationWorkflow && hasPermission(bootstrap, 'OPS.STATION.WORK')) {
    return {
      id: 'start',
      icon: 'start',
      title: 'Your day starts at Stations',
      body: 'Pick your station, take the next patient waiting there, record what it measures, and hand them on.',
    };
  }
  if (hasPermission(bootstrap, 'OPS.ASSIGNMENT.READ_SELF')) {
    return {
      id: 'start',
      icon: 'start',
      title: 'Your day starts in My assigned',
      body: 'The patients assigned to you, in order, with the next thing each one needs.',
    };
  }
  return {
    id: 'start',
    icon: 'start',
    title: 'Your day starts on the dashboard',
    body: "Today's totals and what needs attention next at your clinic.",
  };
}

/** The active clinic's role, as a word, for the welcome line. Null when there is none to name. */
function activeRole(bootstrap: WhoAmIResponse): string | null {
  const role = bootstrap.effectiveRolesForActiveClinic.find((r) => r !== 'PATIENT');
  return role ? formatStaffRole(role) : null;
}

function activeClinicName(bootstrap: WhoAmIResponse): string | null {
  const clinics = bootstrap.availableClinics ?? bootstrap.memberships;
  return clinics.find((clinic) => clinic.clinicId === bootstrap.activeClinicId)?.clinicName ?? null;
}

/**
 * What this person can do, as up to four things to try, each with where it lives. Chosen by
 * permission, like the sidebar, so nobody is told about work they cannot open.
 */
function workPoints(
  bootstrap: WhoAmIResponse,
  { stationWorkflow }: { stationWorkflow: boolean },
): WelcomeTourPoint[] {
  const can = (permission: string) => hasPermission(bootstrap, permission);
  const points: WelcomeTourPoint[] = [];
  if (can('ENCOUNTER.REVIEW') || can('CLINICAL_NOTE.COSIGN')) {
    points.push({
      label: 'Review visits and co-sign notes',
      where: 'Waiting for you at the top of the dashboard, and in Queues.',
    });
  }
  if (stationWorkflow && can('OPS.STATION.WORK')) {
    points.push({
      label: 'Record what your station measures',
      where: 'Stations, then the next patient in your line.',
    });
  }
  if (can('PATIENT.SEARCH')) {
    points.push({
      label: 'Find a patient',
      where: 'Patients. Search by name, patient code or phone.',
    });
  }
  if (can('PATIENT.CREATE')) {
    points.push({ label: 'Register someone new', where: 'New patient, in the sidebar.' });
  }
  if (can('OPS.ASSIGNMENT.MANAGE')) {
    points.push({
      label: 'Run the day',
      where: 'Today board and Queues: who is waiting, and who is with whom.',
    });
  }
  if (can('VOLUNTEER.ROSTER.MANAGE')) {
    points.push({ label: 'Keep the volunteer roster', where: 'Volunteers, under Oversight.' });
  }
  if (can('METRICS.READ')) {
    points.push({ label: 'See how the clinic is doing', where: 'Metrics, under Oversight.' });
  }
  if (can('AUDIT.READ')) {
    points.push({ label: 'See who changed what', where: 'Audit, under Oversight.' });
  }
  return points.slice(0, 4);
}

export function welcomeTourSteps(
  bootstrap: WhoAmIResponse,
  flags: { stationWorkflow: boolean },
): WelcomeTourStep[] {
  if (welcomeTourAudience(bootstrap) === 'patient') {
    return [
      {
        id: 'welcome',
        icon: 'welcome',
        title: 'Welcome to Nkwapa',
        body: 'Your readings, visits and follow-up from your clinic, in one place. Four short steps, under a minute.',
      },
      {
        id: 'health',
        icon: 'health',
        title: 'Your health, over time',
        body: 'The readings your clinic has finalized, and how they are trending.',
        points: [
          {
            label: 'Add a reading between visits',
            where: 'Blood pressure, glucose or weight. Your clinic sees it at your next visit.',
          },
          {
            label: 'Read a trend',
            where: 'Each chart has a table of the same readings, with dates.',
          },
        ],
      },
      {
        id: 'appointments',
        icon: 'appointments',
        title: 'Visits on your terms',
        body: 'Ask for a visit in the dates that suit you, and the clinic confirms a time.',
        points: [
          { label: 'Ask for a visit', where: 'Pick the dates that suit you and say why.' },
          { label: 'Change your mind', where: 'You can ask to move or cancel it later.' },
        ],
      },
      {
        id: 'help',
        icon: 'help',
        title: 'Help is beside the title',
        body: 'Look for the question mark next to a heading for a short explanation of what you are looking at. You can take this tour again from the menu under your name.',
      },
    ];
  }

  const role = activeRole(bootstrap);
  const clinic = activeClinicName(bootstrap);
  const switchable = bootstrap.availableClinics?.length ?? bootstrap.memberships.length;
  const work = workPoints(bootstrap, flags);
  const steps: WelcomeTourStep[] = [
    {
      id: 'welcome',
      icon: 'welcome',
      title: 'Welcome to Nkwapa',
      body:
        role && clinic
          ? `You are signed in as ${role} at ${clinic}. Here is where your work is, in under a minute.`
          : "Your clinic's patients, visits, queues and follow-up in one place. A quick look around takes under a minute.",
    },
    startStep(bootstrap, flags),
  ];
  if (work.length > 0) {
    steps.push({
      id: 'work',
      icon: 'work',
      title: role ? `What you can do as ${role}` : 'What you can do here',
      body: 'Your role decides what you see. These are the places you will use most.',
      points: work,
    });
  }
  steps.push(
    {
      id: 'navigation',
      icon: 'navigation',
      title: 'Finding your way',
      body: 'Three things at the top and side of every page.',
      points: [
        {
          label: 'The sidebar',
          where:
            'Pages grouped by the work they support. Press [ or the button at the top to collapse it.',
        },
        switchable > 1
          ? {
              label: 'One clinic at a time',
              where:
                'What you see belongs to the active clinic. Switch clinics from the picker at the top; records, queues and dashboards follow.',
            }
          : {
              label: 'Your clinic',
              where: 'Records, queues and dashboards all belong to the clinic named at the top.',
            },
        {
          label: 'Help beside the title',
          where:
            'The question mark next to a heading explains it. Anything you must read to work safely stays open on the page.',
        },
      ],
    },
    {
      id: 'offline',
      icon: 'offline',
      title: 'Keep working when the connection drops',
      body: 'Saving still works offline. Changes wait on this device and send themselves when you are back online.',
      points: [
        {
          label: 'Check what is waiting',
          where: 'The sync status at the top shows anything not sent yet, and refreshes the page.',
        },
        {
          label: 'Take this tour again',
          where: 'From the menu under your name, any time.',
        },
      ],
    },
  );
  return steps;
}
