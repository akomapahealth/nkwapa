import type { WhoAmIResponse } from './bootstrap-context';
import { getAccessibleNavItems, type AppNavPlacement } from './app-nav';
import { pickMainRole, type MainRole } from './main-role';
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
 * #345 moved it to 2 on purpose: the tour now points at the real interface, role by role, so it is
 * new content rather than a rewording, and everyone is offered it once.
 */
export const CURRENT_WELCOME_TOUR_VERSION = 2;

/** Fired on `window` to open the tour on demand, from the user menu. */
export const WELCOME_TOUR_OPEN_EVENT = 'nkwapa:welcome-tour:open';

/**
 * The `data-tour` values the shell and the home pages carry. Sidebar and portal links are
 * `nav:<href>`, so a step can point at any of them without a new attribute.
 */
export type WelcomeTourAnchor =
  'clinic-switcher' | 'notifications' | 'sync-status' | 'user-menu' | 'home-work' | `nav:${string}`;

export type WelcomeTourIcon =
  | 'welcome'
  | 'finish'
  | 'home'
  | 'clinic'
  | 'register'
  | 'stations'
  | 'assigned'
  | 'queues'
  | 'patients'
  | 'notifications'
  | 'offline'
  | 'staff'
  | 'volunteers'
  | 'menu'
  | 'metrics'
  | 'report'
  | 'audit'
  | 'clinics'
  | 'duplicates'
  | 'data-requests'
  | 'health'
  | 'appointments';

export interface WelcomeTourStep {
  id: string;
  icon: WelcomeTourIcon;
  /** What this is. */
  title: string;
  /** What you can do here. */
  body: string;
  /** One thing to try. */
  tryThis: string;
  /** The `data-tour` element to spotlight. None, or not on the page: a centred card. */
  anchor?: WelcomeTourAnchor;
}

export type WelcomeTourAudience = 'staff' | 'patient';

/** The tour's six variants: a staff member's main role, or a patient. */
export type WelcomeTourRole = MainRole | 'PATIENT';

export function welcomeTourAudience(bootstrap: WhoAmIResponse): WelcomeTourAudience {
  const roles = new Set([
    ...bootstrap.globalRoles,
    ...bootstrap.memberships.flatMap((membership) => membership.roles),
  ]);
  return roles.size > 0 && [...roles].every((role) => role === 'PATIENT') ? 'patient' : 'staff';
}

export function welcomeTourRole(bootstrap: WhoAmIResponse): WelcomeTourRole {
  if (welcomeTourAudience(bootstrap) === 'patient') return 'PATIENT';
  // Someone with no recognised staff role still gets the volunteer's walk; every step in it is
  // gated by what they can open, so nothing points at a page they cannot reach.
  return (
    pickMainRole([...bootstrap.globalRoles, ...bootstrap.effectiveRolesForActiveClinic]) ??
    'VOLUNTEER'
  );
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

function activeClinicName(bootstrap: WhoAmIResponse): string | null {
  const clinics = bootstrap.availableClinics ?? bootstrap.memberships;
  return clinics.find((clinic) => clinic.clinicId === bootstrap.activeClinicId)?.clinicName ?? null;
}

const ROLE_INTRO: Record<WelcomeTourRole, string> = {
  VOLUNTEER: 'where your clinic day happens: registering patients, starting visits and vitals',
  DOCTOR: 'where your reviews, sign-offs and cosigns wait for you',
  MANAGER: 'how to run the clinic: your staff, volunteer days and messages',
  DIRECTOR: "where the clinic's numbers, reports and audit trail live",
  SYSTEM_ADMIN: 'how to look after clinics, accounts and records across the network',
  PATIENT: 'where your readings, visits and requests are',
};

function welcomeStep(bootstrap: WhoAmIResponse, role: WelcomeTourRole): WelcomeTourStep {
  const clinic = activeClinicName(bootstrap);
  const who =
    role === 'PATIENT'
      ? ''
      : `You are signed in as ${formatStaffRole(role)}${clinic ? ` at ${clinic}` : ''}. `;
  return {
    id: 'welcome',
    icon: 'welcome',
    title: 'Welcome to Nkwapa',
    body: `${who}In under a minute, this shows you ${ROLE_INTRO[role]}.`,
    tryThis: 'Use Next, or the arrow keys, to move along. Skip whenever you like.',
  };
}

const FINISH_STEP: WelcomeTourStep = {
  id: 'finish',
  icon: 'finish',
  title: 'You are ready',
  body: 'That is the tour. Everything it showed stays in the same place on every page.',
  tryThis: 'Take it again any time: open the menu under your name and choose Take the tour.',
};

/**
 * A step before gating. `when` is the shell entry it points at (sidebar, header or account menu),
 * so it is offered only to someone that entry is shown to. `whenAny` when one anchor covers several.
 */
interface CandidateStep extends WelcomeTourStep {
  when?: string;
  whenAny?: string[];
}

const HOME_VOLUNTEER: CandidateStep = {
  id: 'home',
  icon: 'home',
  anchor: 'home-work',
  title: 'Your clinic day',
  body: 'Your home page shows what you have done today and where your next patients and drafts are.',
  tryThis: 'Come back here between patients to see who is next.',
};

const REGISTER: CandidateStep = {
  id: 'register',
  icon: 'register',
  anchor: 'nav:/patients/new',
  when: '/patients/new',
  title: 'Register a patient',
  body: 'Add someone new: their name, contact details and where they live.',
  tryThis: 'Search Patients first, and register only if they are not there.',
};

const STATIONS: CandidateStep = {
  id: 'stations',
  icon: 'stations',
  anchor: 'nav:/stations',
  when: '/stations',
  title: 'Stations',
  body: 'Pick your station, take the next patient waiting there, record what it measures, such as vitals, and send them on.',
  tryThis: 'Open Stations and choose the one you are working at today.',
};

const ASSIGNED: CandidateStep = {
  id: 'assigned',
  icon: 'assigned',
  anchor: 'nav:/my/assigned',
  when: '/my/assigned',
  title: 'My assigned',
  body: 'The patients assigned to you, in order. Start a visit from here and record vitals as you go.',
  tryThis: 'Open the first patient and start their visit.',
};

const QUEUES_VOLUNTEER: CandidateStep = {
  id: 'queues',
  icon: 'queues',
  anchor: 'nav:/queues',
  when: '/queues',
  title: 'Queues',
  body: 'Every visit not yet finished. Visits you saved part way wait under Drafts until you pick them up again.',
  tryThis: 'Open Drafts to find a visit you started earlier.',
};

const OFFLINE: CandidateStep = {
  id: 'offline',
  icon: 'offline',
  anchor: 'sync-status',
  title: 'Working offline',
  body: 'If the connection drops, keep going. Saving still works, and changes send themselves when you are back online.',
  tryThis: 'Click the sync status to see anything still waiting to send.',
};

const NEEDS_YOU_NOW: CandidateStep = {
  id: 'home',
  icon: 'home',
  anchor: 'home-work',
  title: 'Needs you now',
  body: 'Your home page leads with what is waiting for you: visits to review or sign off, and HAP notes to cosign.',
  tryThis: 'Start with the top row each time you sign in.',
};

const QUEUES_DOCTOR: CandidateStep = {
  id: 'queues',
  icon: 'queues',
  anchor: 'nav:/queues',
  when: '/queues',
  title: 'Review and Sign-off',
  body: 'Queues has a Review lane and a Sign-off lane. Open a visit to read it, add your plan and finalize it.',
  tryThis: 'Open the Sign-off lane and take the oldest visit.',
};

const PATIENTS: CandidateStep = {
  id: 'patients',
  icon: 'patients',
  anchor: 'nav:/patients',
  when: '/patients',
  title: 'The patient chart',
  body: 'Find anyone by name, phone or ID. Their chart holds every visit, reading, plan and medication.',
  tryThis: 'Search for a patient you saw recently and open their chart.',
};

const ALERTS: CandidateStep = {
  id: 'notifications',
  icon: 'notifications',
  anchor: 'notifications',
  when: '/notifications',
  title: 'Alerts',
  body: 'Urgent readings, requests and messages arrive here. The number shows how many you have not read.',
  tryThis: 'Open it once a shift so nothing urgent sits unread.',
};

const NEEDS_ATTENTION: CandidateStep = {
  id: 'home',
  icon: 'home',
  anchor: 'home-work',
  title: 'Needs attention',
  body: "Your home page leads with the clinic's waiting work: visits to review, sign off and cosign.",
  tryThis: 'Check it at the start and the end of each clinic day.',
};

const STAFF: CandidateStep = {
  id: 'staff',
  icon: 'staff',
  anchor: 'nav:/admin/users',
  when: '/admin/users',
  title: 'Staff and invitations',
  body: 'See who works at your clinic and what each person can do. Invite someone new or change a role.',
  tryThis: 'Invite a new team member by email.',
};

const VOLUNTEERS: CandidateStep = {
  id: 'volunteers',
  icon: 'volunteers',
  anchor: 'nav:/volunteers',
  when: '/volunteers',
  title: 'Volunteer events',
  body: 'Plan clinic days and see who has signed up to volunteer at each one.',
  tryThis: 'Open the next event and check it has enough people.',
};

const MENU_MANAGER: CandidateStep = {
  id: 'menu',
  icon: 'menu',
  anchor: 'user-menu',
  whenAny: ['/notifications/delivery', '/settings/clinic'],
  title: 'Reminders and clinic settings',
  body: 'The menu under your name holds Message delivery, where you follow the reminders sent to patients, and Clinic settings.',
  tryThis: 'Open the menu and look at Message delivery.',
};

const METRICS: CandidateStep = {
  id: 'metrics',
  icon: 'metrics',
  anchor: 'nav:/metrics',
  when: '/metrics',
  title: 'Metrics',
  body: "The clinic's numbers over time: visits, screening and follow-up.",
  tryThis: 'Open Metrics and look at how visits are trending.',
};

const REPORT: CandidateStep = {
  id: 'report',
  icon: 'report',
  anchor: 'nav:/reports/organization',
  when: '/reports/organization',
  title: 'Reports',
  body: 'The organization report puts every clinic side by side.',
  tryThis: 'Open it and compare your clinic with the others.',
};

const AUDIT: CandidateStep = {
  id: 'audit',
  icon: 'audit',
  anchor: 'nav:/audit',
  when: '/audit',
  title: 'The audit log',
  body: 'Who opened or changed what, and when. Every record view and edit is logged here.',
  tryThis: 'Search for a person to see what they did today.',
};

const CLINIC_SWITCHER: CandidateStep = {
  id: 'clinic',
  icon: 'clinic',
  anchor: 'clinic-switcher',
  title: 'One clinic at a time',
  body: 'Everything you see belongs to the clinic named here. Switch clinic and records, queues and dashboards follow.',
  tryThis: 'Open the picker to see every clinic you can work in.',
};

const CLINICS: CandidateStep = {
  id: 'clinics',
  icon: 'clinics',
  anchor: 'nav:/admin/clinics',
  when: '/admin/clinics',
  title: 'Clinics',
  body: 'Add a clinic, set its zone and keep its details current.',
  tryThis: 'Open a clinic to check its details.',
};

const USERS: CandidateStep = {
  ...STAFF,
  title: 'Users',
  body: 'Every account across the network: invite people, change roles, and disable access when someone leaves.',
  tryThis: 'Search for a person to see their roles in each clinic.',
};

const DUPLICATES: CandidateStep = {
  id: 'duplicates',
  icon: 'duplicates',
  anchor: 'nav:/admin/duplicates',
  when: '/admin/duplicates',
  title: 'Duplicate review',
  body: 'Charts that may belong to the same person. Compare them side by side and merge the ones that match.',
  tryThis: 'Open the first pair and compare their details.',
};

const DATA_REQUESTS: CandidateStep = {
  id: 'data-requests',
  icon: 'data-requests',
  anchor: 'nav:/admin/data-requests',
  when: '/admin/data-requests',
  title: 'Data requests',
  body: 'Patients asking for a copy of their record, a correction or a deletion. Each one has a deadline.',
  tryThis: 'Check for any request that is nearly due.',
};

const PATIENT_STEPS: CandidateStep[] = [
  {
    id: 'home',
    icon: 'home',
    anchor: 'home-work',
    title: 'Your health summary',
    body: 'Your latest readings, your next visit and anything your clinic has asked of you.',
    tryThis: 'Look here first whenever you open Nkwapa.',
  },
  {
    id: 'health',
    icon: 'health',
    anchor: 'nav:/portal/health',
    title: 'My health',
    body: 'The readings your clinic has finalized and how they are trending. Add your own between visits.',
    tryThis: 'Add a blood pressure, glucose or weight reading.',
  },
  {
    id: 'appointments',
    icon: 'appointments',
    anchor: 'nav:/portal/appointments',
    title: 'Appointments',
    body: 'Ask for a visit on the dates that suit you, and the clinic confirms a time. You can ask to move or cancel it later.',
    tryThis: 'Ask for your next visit.',
  },
  {
    id: 'menu',
    icon: 'menu',
    anchor: 'user-menu',
    title: 'Your account',
    body: 'The menu under your name holds your profile, your settings and the light or dark appearance.',
    tryThis: 'Open it and check your contact details are right.',
  },
];

const MIDDLE_STEPS: Record<WelcomeTourRole, CandidateStep[]> = {
  PATIENT: PATIENT_STEPS,
  // Stations and My assigned never both pass the gate: the sidebar shows one or the other.
  VOLUNTEER: [HOME_VOLUNTEER, REGISTER, STATIONS, ASSIGNED, QUEUES_VOLUNTEER, OFFLINE],
  DOCTOR: [NEEDS_YOU_NOW, QUEUES_DOCTOR, PATIENTS, ALERTS, OFFLINE],
  MANAGER: [NEEDS_ATTENTION, STAFF, VOLUNTEERS, MENU_MANAGER, ALERTS],
  DIRECTOR: [NEEDS_ATTENTION, METRICS, REPORT, AUDIT, STAFF],
  SYSTEM_ADMIN: [CLINIC_SWITCHER, CLINICS, USERS, DUPLICATES, DATA_REQUESTS],
};

/** Five at most between the welcome and the finish: seven steps in all. */
const MAX_MIDDLE_STEPS = 5;

const PLACEMENTS: AppNavPlacement[] = ['sidebar', 'header', 'profile'];

/**
 * The tour for this person: a welcome, up to five steps chosen by main role, and a finish. A step
 * is kept only when the shell would show this person what it points at, using the same filter as
 * the sidebar, so permissions and feature flags gate both identically.
 */
export function welcomeTourSteps(bootstrap: WhoAmIResponse): WelcomeTourStep[] {
  const role = welcomeTourRole(bootstrap);
  const reachable = new Set(
    PLACEMENTS.flatMap((placement) =>
      getAccessibleNavItems(bootstrap, placement).map((item) => item.href),
    ),
  );
  const middle = MIDDLE_STEPS[role].filter((step) =>
    step.when
      ? reachable.has(step.when)
      : step.whenAny
        ? step.whenAny.some((href) => reachable.has(href))
        : true,
  );
  const switchable = bootstrap.availableClinics?.length ?? bootstrap.memberships.length;
  if (role !== 'PATIENT' && switchable > 1 && !middle.includes(CLINIC_SWITCHER)) {
    middle.splice(1, 0, CLINIC_SWITCHER);
  }
  return [welcomeStep(bootstrap, role), ...middle.slice(0, MAX_MIDDLE_STEPS), FINISH_STEP];
}
