import Image from 'next/image';

const SUPPORTING = [
  {
    title: 'Hypertension and diabetes, step by step.',
    text: 'Guided interviews classify blood pressure against agreed thresholds, record glucose and HbA1c, and end in a care plan with counseling, medication and a follow-up date. Medication histories are reconciled visit to visit.',
  },
  {
    title: 'Several clinics, one organization.',
    text: "Each clinic's patients are kept separate, and a person can hold different roles at different clinics. Organization-wide reports and cohort analytics bring the numbers together for administrators.",
  },
];

export function CapabilitiesSection() {
  return (
    <section aria-labelledby="capabilities-title" className="bg-accent py-20 sm:py-28">
      <div className="landing-container">
        <h2
          id="capabilities-title"
          className="max-w-3xl text-balance font-heading text-4xl font-semibold leading-[1.08] tracking-[-0.015em] sm:text-5xl"
          data-reveal
        >
          Made for the conditions clinics actually work in.
        </h2>

        <div className="mt-12 grid gap-12 lg:mt-16 lg:grid-cols-12 lg:gap-10">
          <article
            className="overflow-hidden rounded-xl border border-border bg-background lg:col-span-7"
            data-reveal
          >
            <Image
              src="/images/Akomapa-17.jpg"
              alt="A volunteer takes a woman's blood pressure at a table during a community screening."
              width={3600}
              height={2400}
              sizes="(min-width: 1024px) 55vw, 100vw"
              className="aspect-[16/9] w-full object-cover"
            />
            <div className="p-6 sm:p-10">
              <h3 className="font-heading text-3xl font-semibold leading-tight sm:text-4xl">
                Keeps working when the internet doesn&apos;t.
              </h3>
              <p className="mt-4 text-lg leading-relaxed text-foreground/80">
                Registration, visits, vital signs, consent and prescriptions are saved on the device
                first and sent to the server when the connection returns. If two people change the
                same record while offline, the conflict is set aside for someone to resolve instead
                of one change silently replacing the other.
              </p>
              <p className="mt-4 text-sm text-muted-foreground">
                Assigning staff and moving patients between stations still need a connection.
              </p>
            </div>
          </article>

          <div className="flex flex-col gap-10 lg:col-span-5 lg:pt-6" data-reveal>
            {SUPPORTING.map((item) => (
              <article key={item.title} className="border-t-2 border-foreground pt-6">
                <h3 className="font-heading text-2xl font-semibold leading-snug">{item.title}</h3>
                <p className="mt-3 text-lg leading-relaxed text-foreground/80">{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
