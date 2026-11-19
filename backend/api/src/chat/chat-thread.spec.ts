import type { PrismaService } from '../prisma/prisma.service';
import { CHAT_PAGE_SIZE, loadThreadPage } from './chat-thread';

function message(n: number) {
  return {
    id: `m${String(n).padStart(3, '0')}`,
    patientId: 'patient-1',
    doctorId: 'doctor-1',
    sender: 'PATIENT',
    body: `message ${n}`,
    imageUrl: null,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, n)),
  };
}

describe('loadThreadPage', () => {
  const where = { patientId: 'patient-1', doctorId: 'doctor-1' };
  let prisma: { chatMessage: { findMany: jest.Mock; findFirst: jest.Mock } };

  beforeEach(() => {
    prisma = { chatMessage: { findMany: jest.fn(), findFirst: jest.fn() } };
  });

  it('returns the newest page oldest-first and flags older messages', async () => {
    // findMany is asked for newest-first; give it PAGE_SIZE + 1 rows.
    const newestFirst = Array.from({ length: CHAT_PAGE_SIZE + 1 }, (_, i) => message(200 - i));
    prisma.chatMessage.findMany.mockResolvedValue(newestFirst);

    const page = await loadThreadPage(prisma as unknown as PrismaService, where);

    expect(page.hasMore).toBe(true);
    expect(page.thread).toHaveLength(CHAT_PAGE_SIZE);
    expect(page.thread[0].body).toBe(`message ${200 - CHAT_PAGE_SIZE + 1}`);
    expect(page.thread[CHAT_PAGE_SIZE - 1].body).toBe('message 200');
  });

  it('pages strictly before the given message, within the same thread', async () => {
    const cursor = message(100);
    prisma.chatMessage.findFirst.mockResolvedValue({ id: cursor.id, createdAt: cursor.createdAt });
    prisma.chatMessage.findMany.mockResolvedValue([message(99), message(98)]);

    const page = await loadThreadPage(prisma as unknown as PrismaService, where, cursor.id);

    expect(prisma.chatMessage.findFirst).toHaveBeenCalledWith({
      where: { ...where, id: cursor.id },
      select: { createdAt: true, id: true },
    });
    expect(prisma.chatMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          ...where,
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        },
      }),
    );
    expect(page).toEqual({ thread: expect.any(Array), hasMore: false });
    expect(page.thread.map((m) => m.body)).toEqual(['message 98', 'message 99']);
  });

  it("returns an empty page for a cursor that isn't in this thread", async () => {
    prisma.chatMessage.findFirst.mockResolvedValue(null);

    await expect(loadThreadPage(prisma as unknown as PrismaService, where, 'someone-elses-message')).resolves.toEqual({
      thread: [],
      hasMore: false,
    });
    expect(prisma.chatMessage.findMany).not.toHaveBeenCalled();
  });
});
