import { SectionRule } from './SectionRule';

const SAFEGUARDS = [
  {
    lead: "Each clinic's records stay with that clinic.",
    text: 'Enforced by the database, not only by the screen.',
  },
  {
    lead: 'Changes leave a trail.',
    text: 'Edits to patient records and staff access go to an audit log leadership can review.',
  },
  {
    lead: "A visit isn't final until a doctor signs it.",
    text: 'Only the roles allowed to finalize a visit can do so.',
  },
  {
    lead: 'Research data leaves only with consent.',
    text: 'Exports include only consenting patients, de-identified and approved first.',
  },
];

export function TrustSection() {
  return (
    <section
      aria-labelledby="safeguards-title"
      className="border-t border-border bg-card py-20 sm:py-28"
    >
      <div className="landing-container grid gap-12 lg:grid-cols-12 lg:gap-10">
        <SectionRule className="lg:col-span-12" />
        <div className="lg:col-span-4" data-reveal>
          <h2
            id="safeguards-title"
            data-split
            className="text-balance font-heading text-3xl font-semibold leading-[1.12] tracking-[-0.01em] sm:text-4xl"
          >
            Careful with patient records.
          </h2>
        </div>

        <dl className="grid gap-x-10 sm:grid-cols-2 lg:col-span-8" data-reveal>
          {SAFEGUARDS.map((item) => (
            <div key={item.lead} className="border-t border-border py-6">
              <dt className="font-semibold">{item.lead}</dt>
              <dd className="mt-2 leading-relaxed text-muted-foreground">{item.text}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
