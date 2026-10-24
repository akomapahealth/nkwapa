import Image from 'next/image';
import { DesktopFrame, PhoneFrame } from './ProductFrames';

const PHOTO_CLASS = 'h-full w-full object-cover';

const STEPS = [
  {
    title: 'Register',
    text: 'Find the patient or create a new record. Likely duplicates are flagged for review before a second chart is made.',
    caption: 'Intake on a laptop at an Akomapa clinic.',
    media: (
      <Image
        src="/images/Akomapa-3.jpg"
        alt="A volunteer enters a patient's details on a laptop at an intake table while the patient sits across from him."
        width={3600}
        height={2250}
        sizes="(min-width: 1024px) 56vw, 100vw"
        className={PHOTO_CLASS}
      />
    ),
  },
  {
    title: 'Check in',
    text: "Add the patient to today's queue. A clinic manager assigns a volunteer and a doctor, or the patient moves from station to station.",
    caption: 'The waiting area at an Akomapa community clinic.',
    media: (
      <Image
        src="/images/Akomapa-11.jpg"
        alt="Patients seated in a waiting area at an Akomapa community clinic while volunteers work at tables nearby."
        width={3600}
        height={2712}
        sizes="(min-width: 1024px) 56vw, 100vw"
        className={PHOTO_CLASS}
      />
    ),
  },
  {
    title: 'Measure',
    text: 'Record blood pressure, glucose, weight, eye screening and other vital signs, with blood pressure classified against agreed thresholds.',
    caption: 'A blood pressure reading at an Akomapa screening.',
    media: (
      <Image
        src="/images/Akomapa-18.jpg"
        alt="A blood pressure cuff on a patient's arm, with digital monitors on the table beside it."
        width={3600}
        height={2400}
        sizes="(min-width: 1024px) 56vw, 100vw"
        className={PHOTO_CLASS}
      />
    ),
  },
  {
    title: 'Review',
    text: 'The visit is documented as a draft. A doctor reviews it, adds the plan and prescriptions, and finalizes it.',
    caption: 'The clinic dashboard counts the visits waiting for review and sign-off.',
    media: (
      <div className="flex h-full items-center justify-center bg-primary p-4 sm:p-8">
        <DesktopFrame priority sizes="(min-width: 1024px) 50vw, 92vw" className="w-full" />
      </div>
    ),
  },
  {
    title: 'Follow up',
    text: 'Finalizing the visit schedules a follow-up reminder by SMS or email, and appointments are confirmed on the clinic calendar.',
    caption: 'The same clinic workspace on a phone.',
    media: (
      <div className="flex h-full items-center justify-center bg-secondary py-6">
        <PhoneFrame
          priority
          sizes="(min-width: 1024px) 200px, 50vw"
          className="h-full max-h-[30rem] w-auto [&_img]:h-full [&_img]:w-auto"
        />
      </div>
    ),
  },
];

/**
 * One clinic visit, told with the clinic's own photographs and screens. The server HTML is a plain
 * ordered list. On wide screens LandingMotion sets data-journey-pinned, which stacks the steps in one
 * grid cell (globals.css) so the pinned timeline can wipe from one to the next.
 */
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
            <p className="text-eyebrow text-primary">A clinic day</p>
            <h2
              id="journey-title"
              data-split
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

        <div data-journey className="mt-14 lg:mt-16">
          <div aria-hidden data-journey-progress className="mb-6 hidden h-0.5 w-full bg-border">
            <div data-journey-line className="h-full w-full origin-left bg-primary" />
          </div>
          <ol data-journey-list className="grid gap-16 lg:gap-24">
            {STEPS.map((step, index) => (
              <li
                key={step.title}
                data-journey-step
                className="grid gap-6 bg-card lg:grid-cols-12 lg:items-center lg:gap-10"
              >
                <div data-step-text className="lg:col-span-5">
                  <p className="font-heading text-sm font-semibold tabular-nums text-primary">
                    {String(index + 1).padStart(2, '0')}
                    <span className="text-muted-foreground">
                      {' '}
                      / {String(STEPS.length).padStart(2, '0')}
                    </span>
                  </p>
                  <h3 className="mt-2 font-heading text-4xl font-semibold leading-tight sm:text-5xl">
                    {step.title}
                  </h3>
                  <p className="mt-4 max-w-md text-lg leading-relaxed text-foreground/80">
                    {step.text}
                  </p>
                </div>
                <figure data-step-media className="bg-card lg:col-span-7">
                  <div className="aspect-[4/3] overflow-hidden rounded-xl lg:aspect-auto lg:h-[min(62vh,32rem)]">
                    {step.media}
                  </div>
                  <figcaption className="mt-3 text-sm text-muted-foreground">
                    {step.caption}
                  </figcaption>
                </figure>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
