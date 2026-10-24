const SAFEGUARDS = [
  {
    lead: 'Each person sees what their role needs.',
    text: 'Volunteers, doctors, managers and directors each get the screens and chart sections their job requires, and only at clinics where they hold a role.',
  },
  {
    lead: "Each clinic's records stay with that clinic.",
    text: 'The separation is enforced by the database itself, not only by what the interface chooses to show.',
  },
  {
    lead: 'Changes leave a trail.',
    text: 'Changes to patient records and staff access are recorded in an audit log that clinic leadership can filter and review.',
  },
  {
    lead: "A visit isn't final until a doctor signs it.",
    text: 'Visits move from draft to review to finalized, and only the roles allowed to finalize a visit can do so.',
  },
  {
    lead: 'Research data leaves only with consent.',
    text: 'Research exports include only patients who consented, are de-identified, and must be approved before they are produced.',
  },
];

export function TrustSection() {
  return (
    <section
      aria-labelledby="safeguards-title"
      className="border-t border-border bg-card py-20 sm:py-28"
    >
      <div className="landing-container grid gap-12 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-4" data-reveal>
          <h2
            id="safeguards-title"
            data-split
            className="text-balance font-heading text-3xl font-semibold leading-[1.12] tracking-[-0.01em] sm:text-4xl"
          >
            Careful with the records people trust you with.
          </h2>
          <p className="mt-5 leading-relaxed text-muted-foreground">
            The safeguards below are part of how Nkwapa works today, described in plain terms.
          </p>
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
