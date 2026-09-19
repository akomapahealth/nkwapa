import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  RESEARCH_FIELD_DECISIONS,
  RESEARCH_OUT_OF_SCOPE_MODELS,
  RESEARCH_SCOPED_MODELS,
  fullyExcludedModels,
  type ResearchScopedModel,
} from './research-field-registry';

const SCHEMA = readFileSync(
  resolve(__dirname, '../../../../packages/db/prisma/schema.prisma'),
  'utf8',
);

/** Scalar and enum fields declared on a model, ignoring relations and block attributes. */
function declaredFields(model: string): string[] {
  const body = new RegExp(`^model ${model} \\{([\\s\\S]*?)^\\}`, 'm').exec(SCHEMA)?.[1];
  if (!body) throw new Error(`Model ${model} not found in schema.prisma`);

  return body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('//') && !line.startsWith('@@'))
    .map((line) => line.split(/\s+/))
    .filter(([name, type]) => {
      if (!name || !type) return false;
      const base = type.replace(/[?[\]]/g, '');
      // A relation names another model; everything else is a scalar or an enum.
      return !new RegExp(`^model ${base} \\{`, 'm').test(SCHEMA);
    })
    .map(([name]) => name);
}

/** Every model the schema declares. */
function declaredModels(): string[] {
  return [...SCHEMA.matchAll(/^model\s+([A-Za-z0-9_]+)\s*\{/gm)].map((match) => match[1]);
}

/*
  The gap that let hypertension go a whole release without a single decision recorded against it.

  Every case below iterates `RESEARCH_SCOPED_MODELS`, so a model missing from that list was never
  visited and nothing failed -- a table nobody had wired up and a table deliberately left out were
  indistinguishable to a reader and to this suite. Requiring each model to appear in exactly one of
  the two lists is what closes it, and it is the shape `sync-projection.ts` already uses for
  columns.
*/
describe('every table is either in scope or explicitly out of it', () => {
  const scoped = new Set<string>(RESEARCH_SCOPED_MODELS);
  const outOfScope = new Set(Object.keys(RESEARCH_OUT_OF_SCOPE_MODELS));

  it('leaves no model undecided', () => {
    const undecided = declaredModels().filter(
      (model) => !scoped.has(model) && !outOfScope.has(model),
    );
    expect(undecided).toEqual([]);
  });

  it('never names a model in both lists', () => {
    expect([...outOfScope].filter((model) => scoped.has(model))).toEqual([]);
  });

  it('does not exclude a model the schema no longer has', () => {
    const declared = new Set(declaredModels());
    expect([...outOfScope].filter((model) => !declared.has(model))).toEqual([]);
  });

  it('gives every exclusion a reason a reviewer can read', () => {
    for (const [model, reason] of Object.entries(RESEARCH_OUT_OF_SCOPE_MODELS)) {
      expect([model, reason.length > 12, reason.endsWith('.')]).toEqual([model, true, true]);
    }
  });
});

describe('research export field decisions', () => {
  describe.each(RESEARCH_SCOPED_MODELS)('%s', (model: ResearchScopedModel) => {
    const decisions = RESEARCH_FIELD_DECISIONS[model];

    it('answers for every field the schema declares', () => {
      // The point of the registry: a migration that adds a column fails here until someone
      // decides whether it belongs in a research export. Absence used to be indistinguishable
      // from a deliberate omission.
      const undecided = declaredFields(model).filter((field) => !(field in decisions));
      expect(undecided).toEqual([]);
    });

    it('does not answer for a field the schema no longer has', () => {
      const declared = declaredFields(model);
      const stale = Object.keys(decisions).filter((field) => !declared.includes(field));
      expect(stale).toEqual([]);
    });

    it('gives every decision a reason a reviewer can read', () => {
      for (const [field, decision] of Object.entries(decisions)) {
        expect(decision.reason.length).toBeGreaterThan(12);
        expect(decision.reason.endsWith('.')).toBe(true);
        expect(field).not.toBe('');
      }
    });
  });

  it('excludes clinical notes entirely, and says so', () => {
    // Previously absent from the research module with nothing recording whether that was
    // deliberate. It is deliberate.
    expect(fullyExcludedModels()).toEqual(
      expect.arrayContaining(['ClinicalNote', 'ClinicalNoteAddendum']),
    );

    for (const field of ['history', 'assessment', 'plan', 'signedHistory', 'signedAssessment']) {
      expect(RESEARCH_FIELD_DECISIONS.ClinicalNote[field].disposition).toBe('EXCLUDED_FREE_TEXT');
    }
  });

  it('never exports free text from any clinical record', () => {
    for (const model of RESEARCH_SCOPED_MODELS) {
      for (const [field, decision] of Object.entries(RESEARCH_FIELD_DECISIONS[model])) {
        if (/notes?$|Other$|^details$|Text$/.test(field)) {
          expect([model, field, decision.disposition]).toEqual([
            model,
            field,
            expect.stringMatching(/^EXCLUDED_/),
          ]);
        }
      }
    }
  });

  it('never exports a staff identifier as a subject attribute', () => {
    for (const model of RESEARCH_SCOPED_MODELS) {
      for (const [field, decision] of Object.entries(RESEARCH_FIELD_DECISIONS[model])) {
        if (/ByUserId$|NameSnapshot$/.test(field)) {
          expect([model, field, decision.disposition]).toEqual([
            model,
            field,
            expect.stringMatching(/^EXCLUDED_/),
          ]);
        }
      }
    }
  });

  it('keeps the pharmacy address out while keeping its coarse geography', () => {
    const pharmacy = RESEARCH_FIELD_DECISIONS.PatientPharmacyRevision;
    expect(pharmacy.region.disposition).toBe('EXPORTED');
    expect(pharmacy.countryCode.disposition).toBe('EXPORTED');
    for (const field of ['name', 'addressLine1', 'addressLine2', 'addressText', 'phoneE164']) {
      expect(pharmacy[field].disposition).toBe('EXCLUDED_DIRECT_IDENTIFIER');
    }
    for (const field of ['city', 'postalCode']) {
      expect(pharmacy[field].disposition).toBe('EXCLUDED_QUASI_IDENTIFIER');
    }
  });

  it('agrees with the CSV headers the pack actually writes', () => {
    /*
      A decision to export means nothing unless the column exists.

      This used to check `Vitals` alone, which is why most of the diabetes interview could carry
      `EXPORTED` while reaching no analysis: the registry and the pack were only held together for
      one model. Both chronic interviews and the adherence file are now in, so an exported decision
      without a column is a failure here rather than a silence.

      The chronic models are prefixed in the CSV, because one screenings row carries both
      conditions and `status` would otherwise mean two different things.
    */
    const transform = readFileSync(resolve(__dirname, 'research-transform.service.ts'), 'utf8');
    const snake = (field: string) => field.replace(/([A-Z])/g, '_$1').toLowerCase();
    const exported = (model: ResearchScopedModel) =>
      Object.entries(RESEARCH_FIELD_DECISIONS[model])
        .filter(([, d]) => d.disposition === 'EXPORTED')
        .map(([field]) => field);

    const prefixes: Partial<Record<ResearchScopedModel, string>> = {
      HypertensionAssessment: 'hypertension_',
    };

    /*
      Where the CSV name is not what camelCase-to-snake_case produces.

      Kept as an explicit list rather than a cleverer transformation: a rule that split before a
      digit would turn `spo2Percent` into `spo_2_percent`, and a header nobody wanted is worse than
      a line of exception here.
    */
    const columnOverrides: Record<string, string> = {
      dosesMissed7d: 'doses_missed_7d',
    };

    for (const model of [
      'Vitals',
      'HypertensionAssessment',
      'EncounterMedicationAdherence',
    ] as const) {
      for (const field of exported(model)) {
        const name = columnOverrides[field] ?? snake(field);
        const prefix = prefixes[model] ?? '';
        // `hypertensionStatus` is already prefixed by its own name; do not say it twice.
        const column = name.startsWith(prefix) ? name : `${prefix}${name}`;
        expect([model, field, transform.includes(`'${column}'`)]).toEqual([model, field, true]);
      }
    }
  });
});
