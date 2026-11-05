/**
 * The account-setup journeys, as the person walking them sees them (#277).
 *
 * Each journey crosses two systems: the password is chosen on the secure sign-in pages
 * (Keycloak), the rest happens here. Nothing in either system showed the whole path, so a person
 * arriving at /accept-invite or /claim-record had no record of what they had already done or what
 * was left. These lists only describe the existing steps; they change none of them.
 */

export type OnboardingJourney = 'staff' | 'patient';

export interface JourneyStep {
  id: string;
  label: string;
  /** What happens at this step, in one plain sentence. */
  detail: string;
}

export const JOURNEY_TITLES: Record<OnboardingJourney, string> = {
  staff: 'Joining your clinic team',
  patient: 'Opening your patient record',
};

const STAFF_STEPS: JourneyStep[] = [
  {
    id: 'password',
    label: 'Choose a password',
    detail: 'From the link in your invitation email.',
  },
  {
    id: 'accept',
    label: 'Accept your invitation',
    detail: 'Check the clinic and role, then accept.',
  },
  {
    id: 'name',
    label: 'Add your name',
    detail: 'So colleagues can see who did what.',
  },
  {
    id: 'start',
    label: 'Start work',
    detail: 'Your workspace opens with a short tour.',
  },
];

const PATIENT_STEPS: JourneyStep[] = [
  {
    id: 'password',
    label: 'Choose a password',
    detail: 'From the link in your invitation email.',
  },
  {
    id: 'claim',
    label: 'Confirm your details',
    detail: 'Patient code and date of birth from your clinic card.',
  },
  {
    id: 'record',
    label: 'Open your record',
    detail: 'Your care summary, readings and visits.',
  },
];

/**
 * The steps for a journey. The staff name step is listed only when the account still needs a
 * name: someone invited with their name already on file goes straight from accepting to work.
 */
export function journeySteps(
  journey: OnboardingJourney,
  { needsName = true }: { needsName?: boolean } = {},
): JourneyStep[] {
  if (journey === 'patient') return PATIENT_STEPS;
  return needsName ? STAFF_STEPS : STAFF_STEPS.filter((step) => step.id !== 'name');
}

export type JourneyStepState = 'done' | 'current' | 'next';

/** Each step's state, given the id of the step the person is on now. */
export function journeyProgress(steps: JourneyStep[], currentId: string) {
  const current = Math.max(
    0,
    steps.findIndex((step) => step.id === currentId),
  );
  return {
    current,
    states: steps.map(
      (_, index): JourneyStepState =>
        index < current ? 'done' : index === current ? 'current' : 'next',
    ),
  };
}
