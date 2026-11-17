import type {
  FollowUpContactMode,
  FollowUpContactPurpose,
  FollowUpContactStatus,
} from '@prisma/client';
import {
  addDays,
  DEFAULT_FOLLOW_UP_CONFIG,
  nextContact,
  type FollowUpAction,
  type FollowUpConfig,
  type FollowUpTeleChannel,
  type FollowUpTier,
} from '@nkwapa/db';

/**
 * Turning a tier into the patient's next contacts (#338), as one pure function.
 *
 * Each patient has at most one open routine contact in person and one by tele (a routine contact
 * is ROUTINE, CONFIRM_READING, RESCREEN or REMINDER_BEFORE_VISIT; which one depends on the tier),
 * plus the one-off calls: confirming an Urgent referral, and confirming any referral reached care.
 * The plan runs on every recompute. Creating only what is missing keeps a nightly run quiet;
 * moving a date only when the tier's answer changed keeps a date someone agreed with the patient.
 */

export interface OpenContact {
  id: string;
  mode: FollowUpContactMode;
  purpose: FollowUpContactPurpose;
  /** UTC midnight of the due day. */
  dueOn: Date;
  status: Extract<FollowUpContactStatus, 'DUE' | 'MISSED'>;
  createdAt: Date;
}

export interface ContactPlanInput {
  tier: FollowUpTier;
  atTarget: boolean | null;
  actions: readonly FollowUpAction[];
  /** The answer changed on this recompute, so routine dates follow it. */
  changed: boolean;
  /** The patient became Urgent on this recompute. */
  becameUrgent: boolean;
  today: Date;
  latestEncounter: { id: string; at: Date } | null;
  lastTeleAt: Date | null;
  /** The latest care plan's hand-picked follow-up date, if any. */
  carePlanFollowUpDate: Date | null;
  /** Cancelled as died, moved or opted out, and not seen in person since. */
  stopped: boolean;
  /**
   * When a refill call is due, from medicine running out (a prescription's length, or a visit
   * that found under a week left). Null when nothing calls for one, or one was already booked
   * for this news.
   */
  refillDueOn?: Date | null;
  open: readonly OpenContact[];
}

export interface PlannedContact {
  mode: FollowUpContactMode;
  purpose: FollowUpContactPurpose;
  dueOn: Date;
}

export interface ContactPlan {
  completeByEncounter: Array<{ contactId: string; encounterId: string }>;
  markMissed: string[];
  create: PlannedContact[];
  reschedule: Array<{ contactId: string; purpose: FollowUpContactPurpose; dueOn: Date }>;
}

const IN_PERSON_MODES: readonly FollowUpContactMode[] = ['IN_PERSON', 'HOME_VISIT'];
const ROUTINE_PURPOSES: readonly FollowUpContactPurpose[] = [
  'ROUTINE',
  'CONFIRM_READING',
  'RESCREEN',
  'REMINDER_BEFORE_VISIT',
];

const TELE_MODE: Record<FollowUpTeleChannel, FollowUpContactMode> = {
  PHONE_CALL: 'PHONE',
  SMS: 'SMS',
  WHATSAPP: 'WHATSAPP',
  VIDEO: 'VIDEO',
};

/** UTC midnight of a moment's day. Nkwapa's clinics are in Ghana, on UTC all year. */
export function dayOf(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

export const isInPerson = (mode: FollowUpContactMode) => IN_PERSON_MODES.includes(mode);

export function planContacts(
  input: ContactPlanInput,
  config: FollowUpConfig = DEFAULT_FOLLOW_UP_CONFIG,
): ContactPlan {
  const today = dayOf(input.today);
  const plan: ContactPlan = { completeByEncounter: [], markMissed: [], create: [], reschedule: [] };

  // A visit on or near the due date, after the contact was scheduled, completes it: "returned".
  const visit = input.latestEncounter;
  const completed = new Set<string>();
  for (const contact of input.open) {
    if (contact.mode !== 'IN_PERSON' || !visit) continue;
    const window = addDays(contact.dueOn, -config.missedContactGraceDays);
    if (visit.at >= contact.createdAt && visit.at >= window) {
      plan.completeByEncounter.push({ contactId: contact.id, encounterId: visit.id });
      completed.add(contact.id);
    }
  }

  for (const contact of input.open) {
    if (completed.has(contact.id) || contact.status !== 'DUE') continue;
    if (today > addDays(contact.dueOn, config.missedContactGraceDays)) {
      plan.markMissed.push(contact.id);
    }
  }

  if (input.stopped) return plan;

  const due = input.open.filter(
    (c) => c.status === 'DUE' && !completed.has(c.id) && !plan.markMissed.includes(c.id),
  );
  const next = nextContact(
    {
      tier: input.tier,
      atTarget: input.atTarget,
      actions: input.actions,
      lastInPersonAt: visit?.at ?? null,
      lastTeleAt: input.lastTeleAt,
      today: input.today,
    },
    config,
  );
  const notBefore = (at: Date) => (dayOf(at) < today ? today : dayOf(at));

  const slot = (inPerson: boolean, purpose: FollowUpContactPurpose, at: Date | null) => {
    if (!at) return;
    const existing = due.find(
      (c) => isInPerson(c.mode) === inPerson && ROUTINE_PURPOSES.includes(c.purpose),
    );
    const dueOn = notBefore(at);
    if (!existing) {
      plan.create.push({ mode: inPerson ? 'IN_PERSON' : teleMode(config), purpose, dueOn });
    } else if (
      input.changed &&
      (existing.purpose !== purpose || existing.dueOn.getTime() !== dueOn.getTime())
    ) {
      plan.reschedule.push({ contactId: existing.id, purpose, dueOn });
    }
  };

  // A refill call goes ahead whatever the tier: running out of medicine is its own problem.
  if (input.refillDueOn) {
    const dueOn = notBefore(input.refillDueOn);
    const open = due.find((c) => c.purpose === 'ADHERENCE_REFILL');
    if (!open) {
      plan.create.push({ mode: teleMode(config), purpose: 'ADHERENCE_REFILL', dueOn });
    } else if (open.dueOn > dueOn) {
      plan.reschedule.push({ contactId: open.id, purpose: 'ADHERENCE_REFILL', dueOn });
    }
  }

  if (input.tier === 'NOT_TIERED') {
    // Not enough to tier yet, but a raised reading with no diagnosis is repeated on another day.
    if (input.actions.includes('CONFIRM_ON_ANOTHER_DAY')) {
      slot(
        true,
        'CONFIRM_READING',
        addDays(visit?.at ?? input.today, config.confirmationIntervalDays),
      );
    }
    return plan;
  }

  if (input.tier === 'URGENT') {
    // Referred today: the in-person visit is the referral itself. One call to confirm it.
    const open = due.some((c) => c.purpose === 'URGENT_CONFIRMATION');
    if (input.becameUrgent && !open && next.teleDueAt) {
      plan.create.push({
        mode: teleMode(config),
        purpose: 'URGENT_CONFIRMATION',
        dueOn: notBefore(next.teleDueAt),
      });
    }
    return plan;
  }

  const handPicked =
    input.carePlanFollowUpDate && dayOf(input.carePlanFollowUpDate) >= today
      ? input.carePlanFollowUpDate
      : null;
  const inPersonAt =
    next.inPersonDueAt && handPicked && handPicked < next.inPersonDueAt
      ? handPicked
      : next.inPersonDueAt;
  slot(
    true,
    input.actions.includes('CONFIRM_ON_ANOTHER_DAY')
      ? 'CONFIRM_READING'
      : input.tier === 'LOW'
        ? 'RESCREEN'
        : 'ROUTINE',
    inPersonAt,
  );
  slot(
    false,
    config.schedules[input.tier].tele === 'BEFORE_VISIT' ? 'REMINDER_BEFORE_VISIT' : 'ROUTINE',
    next.teleDueAt,
  );
  return plan;
}

function teleMode(config: FollowUpConfig): FollowUpContactMode {
  return TELE_MODE[config.teleChannels[0] ?? 'PHONE_CALL'];
}

/**
 * Days of supply from a prescription's duration, which is free text under "Duration (days)":
 * "30", "30 days", "4 weeks", "1 month". Null when it says no length ("ongoing", blank).
 */
export function supplyDays(duration: string | null | undefined): number | null {
  const match = duration?.trim().match(/^(\d{1,3})\s*(d|days?|w|wks?|weeks?|m|mo|months?)?\b/i);
  if (!match) return null;
  const count = Number(match[1]);
  if (count <= 0) return null;
  const unit = (match[2] ?? 'd').toLowerCase();
  return unit.startsWith('w') ? count * 7 : unit.startsWith('m') ? count * 30 : count;
}

export interface RefillFacts {
  /** Hypertension and diabetes prescriptions, newest first. */
  prescriptions: ReadonlyArray<{ createdAt: Date; duration: string | null }>;
  /** Supply remaining as asked at the latest visit that asked it. */
  supply: { at: Date; remaining: 'NONE' | 'LESS_THAN_ONE_WEEK' | string } | null;
  /** When a refill call was last booked, in any state. One piece of news books one call. */
  lastRefillBookedAt: Date | null;
  today: Date;
}

/** How recent a "less than a week left" answer must be to book a call from it. */
const SUPPLY_NEWS_DAYS = 14;

/**
 * When a refill call is due, or null (#338). A visit that found the patient out of medicine, or
 * under a week from it, asks for a call now or in two days. Otherwise the newest prescription with
 * a length asks for one `refillLeadDays` before it runs out. Either only once: news older than the
 * last refill call booked has been acted on. A prescription that ran out more than the missed-
 * contact grace ago is history, not news.
 */
export function refillDueOn(
  facts: RefillFacts,
  config: FollowUpConfig = DEFAULT_FOLLOW_UP_CONFIG,
): Date | null {
  const today = dayOf(facts.today);
  const isNews = (at: Date) => !facts.lastRefillBookedAt || at > facts.lastRefillBookedAt;
  const { supply } = facts;
  if (
    supply &&
    (supply.remaining === 'NONE' || supply.remaining === 'LESS_THAN_ONE_WEEK') &&
    supply.at >= addDays(today, -SUPPLY_NEWS_DAYS) &&
    isNews(supply.at)
  ) {
    return supply.remaining === 'NONE' ? today : addDays(dayOf(supply.at), 2);
  }
  const latest = facts.prescriptions.find((p) => supplyDays(p.duration) !== null);
  if (!latest || !isNews(latest.createdAt)) return null;
  const runsOut = addDays(dayOf(latest.createdAt), supplyDays(latest.duration)!);
  if (runsOut < addDays(today, -config.missedContactGraceDays)) return null;
  return addDays(runsOut, -config.refillLeadDays);
}
