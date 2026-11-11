import Image from 'next/image';
import { LANDING_BLUR } from '@/lib/landing-blur';
import { DOCTOR_RECORD_ALT, DesktopFrame } from './ProductFrames';
import { SectionRule } from './SectionRule';

// Each role's own screen, captured at 3840x2160 in the light workspace from a synthetic screening
// day in a throwaway copy of the demo clinic, never from a real clinic (R6.1).
const DECK = [
  {
    role: 'Volunteers',
    text: 'Register, check in and measure at their station.',
    src: '/product/volunteer-stations-20261111.png',
    alt: "A volunteer's Stations screen: the next patient at blood pressure and how long they have waited, the rest of that station's queue, and the whole line from registration to review with who is at each station.",
  },
  {
    role: 'Doctors',
    text: "Review visits with the patient's history alongside, then sign them off.",
    src: '/product/doctor-record-20261111.png',
    alt: DOCTOR_RECORD_ALT,
  },
  {
    role: 'Clinic managers',
    text: 'Run the day: shifts, assignments, stations and wait times.',
    src: '/product/manager-dashboard-20261111.png',
    alt: "A clinic manager's dashboard: a visit waiting for a doctor's sign-off, today's clinic totals, and station flow with the longest wait and the staffing at each station.",
  },
];

const OTHER_ROLES = [
  {
    role: 'Directors',
    text: 'Manage who holds which role, review the audit trail and set up research exports.',
  },
  {
    role: 'Patients',
    text: 'Log readings at home, follow their trends and manage appointments.',
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
        <SectionRule />
        <div className="mt-8 grid gap-6 lg:grid-cols-12 lg:items-end" data-reveal>
          <div className="lg:col-span-7">
            <h2
              id="care-teams-title"
              data-split
              className="text-balance font-heading text-4xl font-semibold leading-[1.08] tracking-[-0.015em] sm:text-5xl"
            >
              Built for the whole care team.
            </h2>
          </div>
          <p className="text-lg leading-relaxed text-muted-foreground lg:col-span-5">
            Each person sees the tools their role needs, at the clinics where they hold it.
          </p>
        </div>

        <div data-deck className="mt-14 lg:mt-20">
          <ol data-deck-list className="grid gap-16 lg:gap-24">
            {DECK.map((item) => (
              <li
                key={item.role}
                data-deck-item
                className="grid gap-6 lg:grid-cols-12 lg:items-center lg:gap-10"
              >
                <div data-deck-text className="lg:col-span-4">
                  <h3 className="font-heading text-4xl font-semibold leading-tight sm:text-5xl">
                    {item.role}
                  </h3>
                  <p className="mt-4 max-w-md text-lg leading-relaxed text-foreground/80">
                    {item.text}
                  </p>
                </div>
                <div data-deck-card className="lg:col-span-7 lg:col-start-6">
                  <DesktopFrame
                    priority
                    sizes="(min-width: 1024px) 56vw, 92vw"
                    src={item.src}
                    alt={item.alt}
                  />
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-20 grid gap-12 lg:mt-28 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <div data-reveal-image className="overflow-hidden">
              <Image
                src="/images/Akomapa-34.jpg"
                placeholder="blur"
                blurDataURL={LANDING_BLUR['/images/Akomapa-34.jpg']}
                alt="A volunteer points to letters on an eye chart while a seated patient reads them aloud."
                width={3093}
                height={3600}
                sizes="(min-width: 1024px) 38vw, 100vw"
                className="aspect-[5/4] w-full object-cover"
              />
            </div>
          </div>
          <ul className="border-t-2 border-foreground lg:col-span-7 lg:self-center" data-reveal>
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
