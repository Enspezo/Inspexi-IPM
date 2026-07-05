import { Injectable, Logger } from '@nestjs/common';
import { ChatThreadStatus, User } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { requireOrg } from '@/common';
import { NotesService } from '../notes/notes.service';
import { ChatService } from './chat.service';
import { noteEntityTypeFor } from './chat.helpers';

/**
 * Afronden van een chat: bouwt een leesbaar transcript en legt dat (bij een
 * gekoppeld record) als notitie vast, en zet de thread op AFGEROND. Bouwt op
 * `ChatService` (core) voor de gedeelde thread-toegang en de summary-respons.
 */
@Injectable()
export class ChatTranscriptsService {
  private readonly logger = new Logger(ChatTranscriptsService.name);

  constructor(
    private prisma: PrismaService,
    private core: ChatService,
    private notes: NotesService,
  ) {}

  async closeThread(threadId: string, user: User) {
    await this.core.assertChatEnabled(requireOrg(user));
    const thread = await this.core.loadAccessibleThread(threadId, user);
    if (thread.status === ChatThreadStatus.AFGEROND) {
      return this.core.getThread(threadId, user);
    }

    let noteId: string | null = thread.noteId ?? null;
    const noteType = noteEntityTypeFor(thread.referenceEntityType);
    if (noteType && thread.referenceEntityId) {
      try {
        const transcript = await this.buildTranscript(threadId);
        const note = await this.notes.create(
          {
            entityType: noteType,
            entityId: thread.referenceEntityId,
            content: transcript,
          },
          user,
        );
        noteId = note.id;
      } catch (err) {
        // Een mislukte notitie mag het afronden niet blokkeren.
        this.logger.error(`Transcript-notitie aanmaken faalde voor thread ${threadId}`, err as Error);
      }
    }

    await this.prisma.chatThread.update({
      where: { id: threadId },
      data: { status: ChatThreadStatus.AFGEROND, closedAt: new Date(), noteId },
    });
    return this.core.getThread(threadId, user);
  }

  private async buildTranscript(threadId: string): Promise<string> {
    const messages = await this.prisma.chatMessage.findMany({
      where: { threadId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: { sender: { select: { firstName: true, lastName: true } } },
    });
    const fmt = new Intl.DateTimeFormat('nl-NL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const names = [
      ...new Set(
        messages.map((m) => [m.sender.firstName, m.sender.lastName].filter(Boolean).join(' ')),
      ),
    ];
    const header = [
      'Chat-transcript (afgerond)',
      names.length ? `Deelnemers: ${names.join(', ')}` : null,
      '',
    ]
      .filter((l) => l !== null)
      .join('\n');
    const lines = messages.map(
      (m) =>
        `[${fmt.format(m.createdAt)}] ${[m.sender.firstName, m.sender.lastName]
          .filter(Boolean)
          .join(' ')}: ${m.content}`,
    );
    return `${header}\n${lines.join('\n')}`.trim();
  }
}
