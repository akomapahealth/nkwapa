import Image from 'next/image';

const ROLES = [
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
  {
    role: 'Directors',
    text: 'Invite staff and decide who holds which role at each clinic, review the audit trail, and set up de-identified research exports.',
  },
  {
    role: 'Patients',
    text: 'Can claim their own record to log blood pressure, glucose and weight at home, follow their trends, and request or change appointments.',
  },
];

export function CareTeamSection() {
  return (
    <section
      id="care-teams"
      aria-labelledby="care-teams-title"
      className="bg-background py-20 sm:py-28 lg:py-32"
    >
      <div className="landing-container grid gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-28" data-reveal>
            <p className="text-eyebrow text-primary">Who it&apos;s for</p>
            <h2
              id="care-teams-title"
              data-split
              className="mt-3 text-balance font-heading text-4xl font-semibold leading-[1.08] tracking-[-0.015em] sm:text-5xl"
            >
              Built around the people providing care.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
              Each person signs in to the tools their job needs, at the clinics where they hold a
              role.
            </p>
            <figure className="mt-10">
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
          </div>
        </div>

        <ul className="border-t border-border lg:col-span-7" data-reveal>
          {ROLES.map((item) => (
            <li
              key={item.role}
              className="grid gap-3 border-b border-border py-8 sm:grid-cols-[12rem_1fr] sm:gap-8 lg:py-10"
            >
              <h3 className="font-heading text-2xl font-semibold leading-tight sm:text-[1.75rem]">
                {item.role}
              </h3>
              <p className="text-lg leading-relaxed text-foreground/80">{item.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
