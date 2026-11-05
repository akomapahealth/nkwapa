import { Reflector } from '@nestjs/core';
import { IDEMPOTENT_KEY } from '../idempotency/idempotent.decorator';
import { ClinicalNoteController } from './clinical-note.controller';

// A HAP save that times out on clinic wifi is retried; every write must replay, not repeat (#307).
describe('ClinicalNoteController idempotency', () => {
  const reflector = new Reflector();
  const marked = (name: keyof ClinicalNoteController) =>
    reflector.get<boolean>(IDEMPOTENT_KEY, ClinicalNoteController.prototype[name] as never) ===
    true;

  it.each(['create', 'update', 'seed', 'submit', 'cosign', 'addendum'] as const)(
    'honours an Idempotency-Key on %s',
    (name) => expect(marked(name)).toBe(true),
  );

  it.each(['getEncounter', 'listPatient', 'pending', 'myDrafts'] as const)(
    'leaves the read %s alone',
    (name) => expect(marked(name)).toBe(false),
  );
});
