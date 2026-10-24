import Image from 'next/image';

const PROBLEMS = [
  {
    lead: 'Records stay where they were written.',
    text: 'Paper folders and spreadsheets live at one table, in one clinic, on one laptop.',
  },
  {
    lead: 'Handoffs arrive empty-handed.',
    text: 'A blood pressure taken at one station rarely reaches the doctor at the next with its context.',
  },
  {
    lead: 'Follow-up depends on memory.',
    text: 'Whether a patient is reminded to come back depends on whoever remembers to call.',
  },
  {
    lead: 'The connection comes and goes.',
    text: 'When the clinic Wi-Fi drops, software that depends on it stops the queue.',
  },
];

export function ProblemSection() {
  return (
    <section
      id="problem"
      aria-labelledby="problem-title"
      className="bg-background py-20 sm:py-28 lg:py-32"
    >
      <div className="landing-container grid gap-x-16 gap-y-12 lg:grid-cols-12">
        <div className="lg:col-span-7" data-reveal>
          <h2
            id="problem-title"
            data-scrub-words
            className="text-balance font-heading text-4xl font-semibold leading-[1.08] tracking-[-0.015em] sm:text-5xl lg:text-[3.4rem]"
          >
            A patient visit shouldn&apos;t mean searching through disconnected records.
          </h2>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            At a busy screening clinic, one patient can meet five people before going home: the
            intake table, a volunteer with a blood pressure cuff, another with a glucose meter, a
            doctor, a counselor. When each of them writes somewhere different, the doctor works from
            fragments and the next visit starts from nothing.
          </p>
        </div>

        <figure className="lg:col-span-5 lg:row-span-2">
          <div data-reveal-image className="overflow-hidden rounded-xl">
            <Image
              src="/images/Akomapa-14.jpg"
              alt="A volunteer in a white coat writes on a paper form while a patient leans in beside him at a screening."
              width={3600}
              height={2218}
              sizes="(min-width: 1024px) 40vw, 100vw"
              className="aspect-[4/3] w-full object-cover lg:aspect-[4/5]"
            />
          </div>
          <figcaption className="mt-3 text-sm text-muted-foreground">
            Paper forms at an Akomapa community screening.
          </figcaption>
        </figure>

        <ul className="border-t border-border lg:col-span-7" data-reveal>
          {PROBLEMS.map((item) => (
            <li
              key={item.lead}
              className="grid gap-1 border-b border-border py-5 sm:grid-cols-[17rem_1fr] sm:gap-8"
            >
              <p className="font-semibold text-foreground">{item.lead}</p>
              <p className="text-muted-foreground">{item.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
