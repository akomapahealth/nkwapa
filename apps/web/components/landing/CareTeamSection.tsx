import Image from 'next/image';
import { DesktopFrame } from './ProductFrames';

// shortcut: every card shows the clinic dashboard until each role's own dashboard is captured;
// swap in `src` and `alt` (3840x2160, like desktop.png) per role when the screenshots exist.
const DECK = [
  {
    role: 'Volunteers',
    text: "Register patients, check them in, and record measurements at the station they're working. They see the parts of a chart their role needs.",
  },
  {
    role: 'Doctors',
    text: "Open the visits waiting for review with the patient's earlier visits and vital-sign history alongside, write the plan and prescriptions, then sign the visit off.",
  },
  {
    role: 'Clinic managers',
    text: 'Run the day: start shifts, assign volunteers and doctors to patients, set up stations and their capacity, and keep an eye on wait times.',
  },
];

const OTHER_ROLES = [
  {
    role: 'Directors',
    text: 'Invite staff and decide who holds which role at each clinic, review the audit trail, and set up de-identified research exports.',
  },
  {
    role: 'Patients',
    text: 'Can claim their own record to log blood pressure, glucose and weight at home, follow their trends, and request or change appointments.',
  },
];

/**
 * A deck of role dashboards. The server HTML lists each role beside its screen. On wide screens
 * LandingMotion sets data-deck-pinned (globals.css stacks the roles in one cell), pins the section
 * and shuffles the top card to the back once per role.
 */
export function CareTeamSection() {
  return (
    <section
      id="care-teams"
      aria-labelledby="care-teams-title"
      className="overflow-hidden bg-background py-20 sm:py-28 lg:py-32"
    >
      <div className="landing-container">
        <div className="grid gap-6 lg:grid-cols-12 lg:items-end" data-reveal>
          <div className="lg:col-span-7">
            <p className="text-eyebrow text-primary">Who it&apos;s for</p>
            <h2
              id="care-teams-title"
              data-split
              className="mt-3 text-balance font-heading text-4xl font-semibold leading-[1.08] tracking-[-0.015em] sm:text-5xl"
            >
              Built around the people providing care.
            </h2>
          </div>
          <p className="text-lg leading-relaxed text-muted-foreground lg:col-span-5">
            Each person signs in to the tools their job needs, at the clinics where they hold a
            role.
          </p>
        </div>

        <div data-deck className="mt-14 lg:mt-20">
          <ol data-deck-list className="grid gap-16 lg:gap-24">
            {DECK.map((item, index) => (
              <li
                key={item.role}
                data-deck-item
                className="grid gap-6 lg:grid-cols-12 lg:items-center lg:gap-10"
              >
                <div data-deck-text className="lg:col-span-4">
                  <p className="font-heading text-sm font-semibold tabular-nums text-primary">
                    {String(index + 1).padStart(2, '0')}
                    <span className="text-muted-foreground">
                      {' '}
                      / {String(DECK.length).padStart(2, '0')}
                    </span>
                  </p>
                  <h3 className="mt-2 font-heading text-4xl font-semibold leading-tight sm:text-5xl">
                    {item.role}
                  </h3>
                  <p className="mt-4 max-w-md text-lg leading-relaxed text-foreground/80">
                    {item.text}
                  </p>
                </div>
                <div data-deck-card className="lg:col-span-7 lg:col-start-6">
                  <DesktopFrame priority sizes="(min-width: 1024px) 56vw, 92vw">
                    <span className="absolute left-3 top-3 rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground sm:left-5 sm:top-5 sm:text-sm">
                      {item.role}
                    </span>
                  </DesktopFrame>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-20 grid gap-12 lg:mt-28 lg:grid-cols-12 lg:gap-16">
          <figure className="lg:col-span-5">
            <div data-reveal-image className="overflow-hidden rounded-xl">
              <Image
                src="/images/Akomapa-34.jpg"
                alt="A volunteer points to letters on an eye chart while a seated patient reads them aloud."
                width={3093}
                height={3600}
                sizes="(min-width: 1024px) 38vw, 100vw"
                className="aspect-[5/4] w-full object-cover"
              />
            </div>
            <figcaption className="mt-3 text-sm text-muted-foreground">
              An eye screening station run by volunteers.
            </figcaption>
          </figure>
          <ul className="border-t border-border lg:col-span-7 lg:self-center" data-reveal>
            {OTHER_ROLES.map((item) => (
              <li
                key={item.role}
                className="grid gap-3 border-b border-border py-8 sm:grid-cols-[12rem_1fr] sm:gap-8"
              >
                <h3 className="font-heading text-2xl font-semibold leading-tight sm:text-[1.75rem]">
                  {item.role}
                </h3>
                <p className="text-lg leading-relaxed text-foreground/80">{item.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
