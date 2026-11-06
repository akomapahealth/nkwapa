import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ClinicalNoteService } from './clinical-note.service';
import { ClinicalNoteRepository } from './clinical-note.repository';

/** The author's own HAP drafts, as rows a doctor or volunteer can open (#307, B6). */
describe('HAP note drafts list', () => {
  const actor = (role: UserRole) => ({
    userId: 'user-1',
    roles: [{ clinicId: 'clinic-1', role }],
  });

  it.each([UserRole.DOCTOR, UserRole.VOLUNTEER])('lists a %s their own drafts', async (role) => {
    const rows = [{ id: 'note-1', encounterId: 'enc-1' }];
    const repository = { findDraftsForAuthor: jest.fn().mockResolvedValue(rows) };
    const service = new ClinicalNoteService({} as never, repository as never, {} as never);
    await expect(service.draftsForAuthor('clinic-1', actor(role))).resolves.toBe(rows);
    expect(repository.findDraftsForAuthor).toHaveBeenCalledWith('clinic-1', 'user-1');
  });

  it.each([UserRole.MANAGER, UserRole.DIRECTOR, UserRole.PATIENT])(
    'refuses %s, who writes no clinical notes',
    async (role) => {
      const repository = { findDraftsForAuthor: jest.fn() };
      const service = new ClinicalNoteService({} as never, repository as never, {} as never);
      await expect(service.draftsForAuthor('clinic-1', actor(role))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(repository.findDraftsForAuthor).not.toHaveBeenCalled();
    },
  );

  it("reads only the caller's drafts in this clinic", async () => {
    const prisma = { clinicalNote: { findMany: jest.fn().mockResolvedValue([]) } };
    await new ClinicalNoteRepository(prisma as never).findDraftsForAuthor('clinic-1', 'user-1');
    expect(prisma.clinicalNote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clinicId: 'clinic-1', authorUserId: 'user-1', status: 'DRAFT' },
      }),
    );
  });
});
