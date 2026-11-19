import type { PrismaService } from '../prisma/prisma.service';
import { ChatMessageResponse, toChatMessageResponse } from './chat.mapper';

/** Messages per page. Each can carry a ~2 MB image, so returning a whole
 *  thread on every read and every send doesn't scale. */
export const CHAT_PAGE_SIZE = 50;

export interface ChatThreadPage {
  /** Oldest first, like the full thread used to be. */
  thread: ChatMessageResponse[];
  /** True when messages older than `thread[0]` exist (load with `before`). */
  hasMore: boolean;
}

/**
 * The newest page of a doctor-patient thread, or the page just older than
 * message `before`. `before` must belong to the same thread (it's matched
 * inside the same `where`, so a foreign id simply yields an empty page).
 */
export async function loadThreadPage(
  prisma: PrismaService,
  where: { patientId: string; doctorId: string },
  before?: string,
): Promise<ChatThreadPage> {
  let olderThan: { createdAt: Date; id: string } | null = null;

  if (before) {
    olderThan = await prisma.chatMessage.findFirst({ where: { ...where, id: before }, select: { createdAt: true, id: true } });
    if (!olderThan) {
      return { thread: [], hasMore: false };
    }
  }

  const rows = await prisma.chatMessage.findMany({
    where: {
      ...where,
      ...(olderThan && {
        OR: [
          { createdAt: { lt: olderThan.createdAt } },
          { createdAt: olderThan.createdAt, id: { lt: olderThan.id } },
        ],
      }),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: CHAT_PAGE_SIZE + 1,
  });

  const hasMore = rows.length > CHAT_PAGE_SIZE;
  const page = rows.slice(0, CHAT_PAGE_SIZE).reverse();

  return { thread: page.map(toChatMessageResponse), hasMore };
}
