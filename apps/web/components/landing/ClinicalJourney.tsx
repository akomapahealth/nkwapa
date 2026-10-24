const STEPS = [
  {
    title: 'Register',
    text: 'Find the patient or create a new record. Likely duplicates are flagged for review before a second chart is made.',
  },
  {
    title: 'Check in',
    text: "Add the patient to today's queue. A clinic manager assigns a volunteer and a doctor, or the patient moves from station to station.",
  },
  {
    title: 'Measure',
    text: 'Record blood pressure, glucose, weight, eye screening and other vital signs, with blood pressure classified against agreed thresholds.',
  },
  {
    title: 'Review',
    text: 'The visit is documented as a draft. A doctor reviews it, adds the plan and prescriptions, and finalizes it.',
  },
  {
    title: 'Follow up',
    text: 'Finalizing the visit schedules a follow-up reminder by SMS or email, and appointments are confirmed on the clinic calendar.',
  },
];

export function ClinicalJourney() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="journey-title"
      className="border-y border-border bg-card py-20 sm:py-28"
    >
      <div className="landing-container">
        <div className="grid gap-6 lg:grid-cols-12 lg:items-end" data-reveal>
          <div className="lg:col-span-7">
            <p className="text-eyebrow text-primary">How it works</p>
            <h2
              id="journey-title"
              className="mt-3 text-balance font-heading text-4xl font-semibold leading-[1.1] tracking-[-0.015em] sm:text-5xl"
            >
              One visit, from the front door to the follow-up.
            </h2>
          </div>
          <p className="text-lg leading-relaxed text-muted-foreground lg:col-span-5">
            Every step writes to the same patient record, so the person at the next step starts with
            what the last one learned.
          </p>
        </div>

        <div data-journey className="relative mt-14 lg:mt-20">
          <div
            aria-hidden
            className="absolute bottom-3 left-[11px] top-3 w-0.5 bg-border lg:bottom-auto lg:left-0 lg:right-0 lg:top-[11px] lg:h-0.5 lg:w-auto"
          >
            <div data-journey-line className="h-full w-full origin-top bg-primary lg:origin-left" />
          </div>
          <ol className="relative grid gap-10 lg:grid-cols-5 lg:gap-8">
            {STEPS.map((step, index) => (
              <li key={step.title} data-journey-step className="relative pl-12 lg:pl-0 lg:pt-14">
                <span
                  aria-hidden
                  className="absolute left-0 top-0 flex h-6 w-6 items-center justify-center rounded-full border-2 border-primary bg-card"
                >
                  <span className="h-2 w-2 rounded-full bg-primary" />
                </span>
                <p className="font-heading text-sm font-semibold tabular-nums text-primary">
                  {String(index + 1).padStart(2, '0')}
                </p>
                <h3 className="mt-1 font-heading text-2xl font-semibold">{step.title}</h3>
                <p className="mt-3 leading-relaxed text-muted-foreground">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
