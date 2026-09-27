/**
 * Product and operational telemetry: every event the platform may emit, and exactly what it may
 * carry.
 *
 * One definition, consumed by both sides. The API records server events through it and the web
 * app sends client events through it, so neither can emit an event or a property this file has
 * not named. That is the privacy control: payloads are built from an allow-list, never from a
 * block-list, because a block-list only stops the leaks someone already thought of.
 *
 * What an event may carry:
 * - an enumerated value from a fixed list,
 * - a count or a duration (a bounded non-negative integer),
 * - a boolean,
 * - a `reason`, which must look like a machine code (`APPOINTMENT_INVALID_TRANSITION`). Free text
 *   cannot match the pattern, so an exception message that happens to contain a name or a phone
 *   number is dropped rather than recorded.
 *
 * What an event never carries: names, contact details, dates of birth, national IDs, clinical
 * values, free text, or patient and user identifiers. The only identifier is the clinic, which is
 * an organisational unit rather than a person. Telemetry answers "how often" and "how well"; the
 * audit log remains the record of who did what to whom.
 */

export const TELEMETRY_OUTCOMES = ['SUCCEEDED', 'FAILED'] as const;
export type TelemetryOutcome = (typeof TELEMETRY_OUTCOMES)[number];

export const TELEMETRY_CATEGORIES = [
  'appointments',
  'identity',
  'invites',
  'sync',
  'security',
  'engagement',
] as const;
export type TelemetryCategory = (typeof TELEMETRY_CATEGORIES)[number];

type PropertyRule =
  | { kind: 'enum'; values: readonly string[] }
  | { kind: 'count'; max: number }
  | { kind: 'boolean' };

const oneOf = (...values: string[]): PropertyRule => ({ kind: 'enum', values });
const count = (max = 10_000): PropertyRule => ({ kind: 'count', max });
const flag: PropertyRule = { kind: 'boolean' };

/** Properties every event may carry, in addition to its own. */
const COMMON_PROPERTIES = {
  outcome: oneOf(...TELEMETRY_OUTCOMES),
  durationMs: count(600_000),
} satisfies Record<string, PropertyRule>;

const APPOINTMENT_REQUEST_KIND = oneOf('NEW', 'RESCHEDULE', 'CANCEL');
const SYNC_ENTITY = oneOf(
  'patient',
  'encounter',
  'vitals',
  'encounter_vitals_bundle',
  'diabetes_screening',
  'hypertension_assessment',
  'encounter_medication_adherence',
  'care_plan',
  'patient_consent',
  'prescription',
  'medical_history_revision',
  'patient_medication_revision',
  'medication_reconciliation',
  'patient_pharmacy_revision',
  'patient_pharmacy_preference',
  'other',
);

export interface TelemetryEventDefinition {
  category: TelemetryCategory;
  /** Emitted by the browser rather than the API. */
  client?: boolean;
  description: string;
  properties?: Record<string, PropertyRule>;
}

const event = (definition: TelemetryEventDefinition) => definition;

export const TELEMETRY_EVENTS = {
  // Appointments: the request-to-visit funnel and the lifecycle after it.
  'appointment.request.submit': event({
    category: 'appointments',
    description: 'A patient asked for a new visit, a reschedule, or a cancellation.',
    properties: { kind: APPOINTMENT_REQUEST_KIND },
  }),
  'appointment.request.confirm': event({
    category: 'appointments',
    description: 'Staff confirmed a patient request, booking or changing the visit.',
    properties: { kind: APPOINTMENT_REQUEST_KIND },
  }),
  'appointment.request.reject': event({
    category: 'appointments',
    description: 'Staff declined a patient request.',
    properties: { kind: APPOINTMENT_REQUEST_KIND },
  }),
  'appointment.reschedule': event({
    category: 'appointments',
    description: 'Staff moved a confirmed appointment.',
  }),
  'appointment.cancel': event({
    category: 'appointments',
    description: 'Staff cancelled an appointment.',
  }),
  'appointment.complete': event({
    category: 'appointments',
    description: 'An appointment was marked completed.',
  }),
  'appointment.no_show': event({
    category: 'appointments',
    description: 'An appointment was marked as a no-show.',
  }),

  // Patient identity: duplicate resolution.
  'patient.merge.preview': event({
    category: 'identity',
    description: 'Staff previewed merging two charts.',
    properties: { blocked: flag, blockerCount: count(50), warningCount: count(50) },
  }),
  'patient.merge.execute': event({
    category: 'identity',
    description: 'Staff merged two charts.',
  }),

  // Invitations: the invite-to-claim funnel for patients and staff.
  'portal.invite.create': event({
    category: 'invites',
    description: 'Staff invited a patient to the portal.',
    properties: { delivered: flag, accountCreated: flag },
  }),
  'portal.invite.resend': event({
    category: 'invites',
    description: 'Staff resent a portal invitation.',
  }),
  'portal.invite.cancel': event({
    category: 'invites',
    description: 'Staff cancelled a portal invitation.',
  }),
  'portal.claim': event({
    category: 'invites',
    description: 'A patient tried to claim their record with an invitation.',
  }),
  'staff.invite.create': event({
    category: 'invites',
    description: 'A director or manager invited a staff member.',
  }),
  'staff.invite.accept': event({
    category: 'invites',
    description: 'An invited staff member tried to accept.',
  }),

  // Offline sync.
  'sync.push': event({
    category: 'sync',
    description: 'A device pushed a batch of offline changes.',
    properties: {
      mutations: count(500),
      applied: count(500),
      conflicts: count(500),
      errors: count(500),
      retryable: count(500),
    },
  }),
  'sync.mutation.refuse': event({
    category: 'sync',
    description: 'The server refused one offline change.',
    properties: { entityType: SYNC_ENTITY, retryable: flag },
  }),
  'sync.center.open': event({
    category: 'sync',
    client: true,
    description: 'A clinician opened the sync center.',
    properties: { blocked: count(500), queued: count(500) },
  }),
  'sync.change.retry': event({
    category: 'sync',
    client: true,
    description: 'A clinician retried a refused offline change.',
  }),
  'sync.change.discard': event({
    category: 'sync',
    client: true,
    description: 'A clinician discarded a refused offline change.',
  }),

  // Security.
  'security.rate_limit': event({
    category: 'security',
    description: 'A request was refused for exceeding a rate limit.',
    properties: { scope: oneOf('user', 'ip', 'user-or-ip') },
  }),

  // Public site engagement.
  'landing.page.view': event({
    category: 'engagement',
    client: true,
    description: 'The public landing page was viewed.',
  }),
  'landing.cta.click': event({
    category: 'engagement',
    client: true,
    description: 'A landing page call to action was used.',
    properties: { target: oneOf('workflow', 'product') },
  }),
} as const satisfies Record<string, TelemetryEventDefinition>;

export type TelemetryEventName = keyof typeof TELEMETRY_EVENTS;

export type TelemetryPropertyValue = string | number | boolean;
export type TelemetryProperties = Record<string, TelemetryPropertyValue>;

/** A machine code: upper-case letters, digits and underscores. Free text cannot match. */
const REASON_CODE = /^[A-Z][A-Z0-9_]{1,63}$/;
/** A rate-limit bucket name, e.g. `sync_push`. Lower-case identifiers only. */
const BUCKET_KEY = /^[a-z][a-z0-9_]{1,47}$/;

export function isTelemetryEventName(value: unknown): value is TelemetryEventName {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(TELEMETRY_EVENTS, value);
}

export function isTelemetryReasonCode(value: unknown): value is string {
  return typeof value === 'string' && REASON_CODE.test(value);
}

function conforms(rule: PropertyRule, value: unknown): value is TelemetryPropertyValue {
  switch (rule.kind) {
    case 'enum':
      return typeof value === 'string' && rule.values.includes(value);
    case 'count':
      return (
        typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= rule.max
      );
    case 'boolean':
      return typeof value === 'boolean';
  }
}

export interface SanitizedTelemetry {
  event: TelemetryEventName;
  category: TelemetryCategory;
  reason: string | null;
  /** Only a rate-limit event names its bucket. */
  bucket: string | null;
  properties: TelemetryProperties;
  /** Property names that were refused, so a caller's mistake can be logged and fixed. */
  dropped: string[];
}

/**
 * Reduce a proposed payload to what the catalog allows for this event.
 *
 * Returns null for an event the catalog does not name. Unknown properties and values that do not
 * match their rule are dropped, and named in `dropped` so the mistake is visible without the value
 * itself ever being logged.
 */
export function sanitizeTelemetry(
  name: string,
  input: Record<string, unknown> = {},
): SanitizedTelemetry | null {
  if (!isTelemetryEventName(name)) return null;
  const definition: TelemetryEventDefinition = TELEMETRY_EVENTS[name];
  const rules: Record<string, PropertyRule> = { ...COMMON_PROPERTIES, ...definition.properties };
  const properties: TelemetryProperties = {};
  const dropped: string[] = [];
  let reason: string | null = null;
  let bucket: string | null = null;

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;
    if (key === 'reason') {
      if (isTelemetryReasonCode(value)) reason = value;
      else dropped.push(key);
      continue;
    }
    if (key === 'bucket' && name === 'security.rate_limit') {
      if (typeof value === 'string' && BUCKET_KEY.test(value)) bucket = value;
      else dropped.push(key);
      continue;
    }
    const rule = rules[key];
    if (rule && conforms(rule, value)) properties[key] = value;
    else dropped.push(key);
  }

  return { event: name, category: definition.category, reason, bucket, properties, dropped };
}

export interface TelemetryFunnel {
  id: string;
  label: string;
  description: string;
  /** Ordered steps; each counts the step's successful events in the window. */
  steps: ReadonlyArray<{ event: TelemetryEventName; label: string }>;
}

/**
 * The conversions the product and operations teams asked to measure.
 *
 * Counted per window rather than per person, deliberately: following one patient from request to
 * visit would need an identifier in every event, which is exactly what telemetry must not hold. A
 * window's step-to-step ratio is the honest measure that needs none.
 */
export const TELEMETRY_FUNNELS: readonly TelemetryFunnel[] = [
  {
    id: 'appointment-requests',
    label: 'Appointment requests',
    description: 'Patient requests submitted, and how many staff confirmed.',
    steps: [
      { event: 'appointment.request.submit', label: 'Requested' },
      { event: 'appointment.request.confirm', label: 'Confirmed' },
    ],
  },
  {
    id: 'appointments',
    label: 'Visits',
    description: 'Confirmed requests, and how the visits ended.',
    steps: [
      { event: 'appointment.request.confirm', label: 'Booked' },
      { event: 'appointment.complete', label: 'Completed' },
    ],
  },
  {
    id: 'patient-merges',
    label: 'Chart merges',
    description: 'Merge previews, and how many became merges.',
    steps: [
      { event: 'patient.merge.preview', label: 'Previewed' },
      { event: 'patient.merge.execute', label: 'Merged' },
    ],
  },
  {
    id: 'portal-invites',
    label: 'Portal invitations',
    description: 'Patients invited, and how many claimed their record.',
    steps: [
      { event: 'portal.invite.create', label: 'Invited' },
      { event: 'portal.claim', label: 'Claimed' },
    ],
  },
  {
    id: 'staff-invites',
    label: 'Staff invitations',
    description: 'Staff invited, and how many accepted.',
    steps: [
      { event: 'staff.invite.create', label: 'Invited' },
      { event: 'staff.invite.accept', label: 'Accepted' },
    ],
  },
];
