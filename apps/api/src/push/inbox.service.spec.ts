import { InboxService } from './inbox.service';

function setup() {
  const inboxNotification = {
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    updateMany: jest.fn().mockResolvedValue({ count: 2 }),
  };
  return { service: new InboxService({ inboxNotification } as never), inboxNotification };
}

const person = (roles: { clinicId: string | null; role: string }[]) => ({
  user: { id: 'u1', keycloakSub: 's', displayName: 'Ama', email: null },
  roles,
});

describe('InboxService', () => {
  it('lists only notifications about clinics the reader still works at', async () => {
    const { service, inboxNotification } = setup();
    await service.list(person([{ clinicId: 'c1', role: 'VOLUNTEER' }]));
    expect(inboxNotification.findMany.mock.calls[0][0].where).toEqual({
      userId: 'u1',
      OR: [{ clinicId: null }, { clinicId: { in: ['c1'] } }],
    });
  });

  it('does not narrow by clinic for an organisation-wide role', async () => {
    const { service, inboxNotification } = setup();
    await service.unreadCount(person([{ clinicId: null, role: 'SYSTEM_ADMIN' }]));
    expect(inboxNotification.count.mock.calls[0][0].where).toEqual({ userId: 'u1', readAt: null });
  });

  it('marks only the given unread notifications read, within the same filter', async () => {
    const { service, inboxNotification } = setup();
    await service.markRead(person([{ clinicId: 'c1', role: 'DOCTOR' }]), ['n1']);
    expect(inboxNotification.updateMany.mock.calls[0][0].where).toMatchObject({
      userId: 'u1',
      readAt: null,
      id: { in: ['n1'] },
    });
  });
});
