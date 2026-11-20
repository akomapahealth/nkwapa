import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { EncounterService } from './encounter.service';

const ADMIN = { userId: 'admin-1', roles: [{ clinicId: null, role: UserRole.SYSTEM_ADMIN }] };
const DIRECTOR = { userId: 'dir-1', roles: [{ clinicId: 'clinic-1', role: UserRole.DIRECTOR }] };

function setup(encounter: Record<string, unknown> | null, note?: Record<string, unknown> | null) {
  const tx = {
    encounter: { findFirst: jest.fn().mockResolvedValue(encounter), delete: jest.fn() },
    clinicalNote: { findFirst: jest.fn().mockResolvedValue(note ?? null), delete: jest.fn() },
  };
  const prisma = { $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)) };
  const audit = { logWrite: jest.fn() };
  const risk = { recomputeAfterCommit: jest.fn() };
  const service = new EncounterService(
    {} as never,
    prisma as never,
    audit as never,
    {} as never,
    risk as never,
  );
  return { service, tx, audit, risk };
}

const draft = (clinicalNote: Record<string, unknown> | null = null) => ({
  id: 'enc-1',
  clinicId: 'clinic-1',
  patientId: 'patient-1',
  status: 'DRAFT',
  clinicalNote,
  vitals: { id: 'v-1' },
  prescriptions: [],
});

describe('EncounterService draft deletion (#384)', () => {
  it('deletes a draft visit with its draft note and audits the reason without note text', async () => {
    const { service, tx, audit, risk } = setup(
      draft({ id: 'note-1', status: 'DRAFT', version: 2 }),
    );

    await expect(
      service.deleteDraft('clinic-1', 'enc-1', 'Test patient visit', ADMIN),
    ).resolves.toEqual({ deleted: true, patientId: 'patient-1' });

    expect(tx.clinicalNote.delete).toHaveBeenCalledWith({ where: { id: 'note-1' } });
    expect(tx.encounter.delete).toHaveBeenCalledWith({ where: { id: 'enc-1' } });
    const [entry, client] = audit.logWrite.mock.calls[0];
    expect(client).toBe(tx);
    expect(entry).toEqual(
      expect.objectContaining({
        action: 'ENCOUNTER.DELETE',
        entityId: 'enc-1',
        clinicId: 'clinic-1',
      }),
    );
    expect(JSON.parse(entry.afterJson)).toEqual(
      expect.objectContaining({ reason: 'Test patient visit' }),
    );
    expect(JSON.parse(entry.beforeJson).clinicalNote).toEqual({
      id: 'note-1',
      status: 'DRAFT',
      version: 2,
    });
    expect(risk.recomputeAfterCommit).toHaveBeenCalledWith(
      expect.objectContaining({ patientId: 'patient-1' }),
    );
  });

  it('refuses anyone but a system admin before touching the database', async () => {
    const { service, tx } = setup(draft());
    await expect(
      service.deleteDraft('clinic-1', 'enc-1', 'reason', DIRECTOR),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.encounter.findFirst).not.toHaveBeenCalled();
  });

  it.each(['IN_REVIEW', 'FINALIZED'])('refuses a %s visit', async (status) => {
    const { service, tx, audit } = setup({ ...draft(), status });
    await expect(service.deleteDraft('clinic-1', 'enc-1', 'reason', ADMIN)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.encounter.delete).not.toHaveBeenCalled();
    expect(audit.logWrite).not.toHaveBeenCalled();
  });

  it('refuses a draft visit whose note was already submitted', async () => {
    const { service, tx } = setup(draft({ id: 'note-1', status: 'PENDING_COSIGN', version: 3 }));
    await expect(service.deleteDraft('clinic-1', 'enc-1', 'reason', ADMIN)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.clinicalNote.delete).not.toHaveBeenCalled();
    expect(tx.encounter.delete).not.toHaveBeenCalled();
  });

  it('turns a note hidden by row security into the same refusal, not a 500', async () => {
    const { service, tx } = setup(draft());
    tx.encounter.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('fk', { code: 'P2003', clientVersion: 'test' }),
    );
    await expect(service.deleteDraft('clinic-1', 'enc-1', 'reason', ADMIN)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('answers 404 for a visit at another clinic', async () => {
    const { service } = setup(null);
    await expect(service.deleteDraft('clinic-1', 'enc-1', 'reason', ADMIN)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('deletes only a draft note, keeping the visit', async () => {
    const { service, tx, audit } = setup(draft(), { id: 'note-1', status: 'DRAFT', version: 1 });
    await expect(service.deleteDraftNote('clinic-1', 'enc-1', 'Duplicate', ADMIN)).resolves.toEqual(
      {
        deleted: true,
      },
    );
    expect(tx.clinicalNote.delete).toHaveBeenCalledWith({ where: { id: 'note-1' } });
    expect(tx.encounter.delete).not.toHaveBeenCalled();
    expect(audit.logWrite.mock.calls[0][0].action).toBe('CLINICAL_NOTE.DELETE');
  });

  it('refuses a cosigned note', async () => {
    const { service, tx } = setup(draft(), { id: 'note-1', status: 'COSIGNED', version: 4 });
    await expect(
      service.deleteDraftNote('clinic-1', 'enc-1', 'reason', ADMIN),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.clinicalNote.delete).not.toHaveBeenCalled();
  });
});
