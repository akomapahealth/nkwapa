import type { WhoAmIResponse } from './bootstrap-context';

/**
 * The welcome tour: a short first-run introduction, once per person.
 *
 * Not onboarding. "Onboarding" in this codebase means the account steps that gate the app
 * (claiming a patient record, accepting a staff invitation); the tour gates nothing and is offered
 * only after those are done.
 *
 * Bump the version when the tour changes enough to be worth showing again. The server stores the
 * last version each person finished or skipped, and the tour is offered while that is lower.
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
  | 'appointments';

export interface WelcomeTourStep {
  id: string;
  icon: WelcomeTourIcon;
  title: string;
  body: string;
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
      title: 'Your day starts in My Assigned',
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
        body: 'Your readings, visits and follow-up from your clinic, in one place. This takes under a minute.',
      },
      {
        id: 'health',
        icon: 'health',
        title: 'Your health, over time',
        body: 'Health shows the readings your clinic has finalized and how they are trending. You can add your own blood pressure, glucose and weight between visits.',
      },
      {
        id: 'appointments',
        icon: 'appointments',
        title: 'Visits on your terms',
        body: 'Ask for a visit in the dates that suit you, and the clinic confirms a time. You can ask to move or cancel it later.',
      },
      {
        id: 'help',
        icon: 'help',
        title: 'Help is beside the title',
        body: 'Look for the question mark next to a heading for a short explanation of what you are looking at.',
      },
    ];
  }

  const switchable = bootstrap.availableClinics?.length ?? bootstrap.memberships.length;
  return [
    {
      id: 'welcome',
      icon: 'welcome',
      title: 'Welcome to Nkwapa',
      body: "Your clinic's patients, visits, queues and follow-up in one place. A quick look around takes under a minute.",
    },
    startStep(bootstrap, flags),
    {
      id: 'navigation',
      icon: 'navigation',
      title: 'Everything is in the sidebar',
      body: 'Pages are grouped by the work they support. Collapse the sidebar with the button at the top of the page when you need the room.',
    },
    {
      id: 'clinic',
      icon: 'clinic',
      title: switchable > 1 ? 'One clinic at a time' : 'Everything is your clinic',
      body:
        switchable > 1
          ? 'What you see belongs to the active clinic. Switch clinics from the picker at the top; records, queues and dashboards follow.'
          : 'Records, queues and dashboards all belong to the clinic named at the top of the page.',
    },
    {
      id: 'offline',
      icon: 'offline',
      title: 'Keep working when the connection drops',
      body: 'Saving still works offline. Changes wait on this device and send themselves when you are back online; the sync status at the top shows anything still waiting.',
    },
    {
      id: 'help',
      icon: 'help',
      title: 'Help is beside the title',
      body: 'The question mark next to a heading opens a short explanation. Anything you must read to work safely stays open on the page instead.',
    },
  ];
}
