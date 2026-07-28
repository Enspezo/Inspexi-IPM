import {
  ChatThreadStatus,
  ChatThreadType,
  NoteEntityType,
  Prisma,
  Role,
  User,
} from '@prisma/client';
import { PrismaService } from '@/prisma';

/** Lichte gebruikersweergave incl. presence voor de chat-UI. */
export const USER_SUMMARY = {
  id: true,
  firstName: true,
  lastName: true,
  initials: true,
  avatarUrl: true,
  availability: true,
  availabilityNote: true,
  lastSeenAt: true,
} satisfies Prisma.UserSelect;

export const MESSAGE_SENDER = {
  id: true,
  firstName: true,
  lastName: true,
  initials: true,
  avatarUrl: true,
} satisfies Prisma.UserSelect;

/**
 * Referentie-types die in een chat gekoppeld mogen worden (PascalCase modelnaam).
 * `note` geeft het NoteEntityType waarmee een transcript bij afronden wordt
 * opgeslagen — `null` betekent "wel koppelbaar, maar geen notitie bij afronden".
 */
export const REFERENCE_TYPES = [
  'Contact',
  'ContactPerson',
  'Location',
  'Request',
  'Quote',
  'Task',
  'Document',
  'Product',
  'PlanningItem',
  'Project',
  'WorkOrder',
  'InspectionPlan',
  'User',
] as const;
export type ReferenceType = (typeof REFERENCE_TYPES)[number];

export function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

export function directKey(a: string, b: string): string {
  return [a, b].sort().join(':');
}

export function teamRolesOf(user: User): Role[] {
  // SUPERUSER is geen org-teamrol; chat is strikt org-gebonden.
  return user.roles.filter((r) => r !== Role.SUPERUSER);
}

export function noteEntityTypeFor(type: string | null): NoteEntityType | null {
  switch (type) {
    case 'Contact':
      return NoteEntityType.CONTACT;
    case 'Request':
      return NoteEntityType.REQUEST;
    case 'Quote':
      return NoteEntityType.QUOTE;
    case 'PlanningItem':
      return NoteEntityType.PLANNING;
    case 'Project':
      return NoteEntityType.PROJECT;
    case 'User':
      return NoteEntityType.USER;
    case 'WorkOrder':
      return NoteEntityType.WORK_ORDER;
    default:
      return null;
  }
}

/** Batch-resolve leesbare namen voor record-referenties (key = `${type}:${id}`). */
export async function resolveReferenceNames(
  prisma: PrismaService,
  refs: Array<{ referenceEntityType: string | null; referenceEntityId: string | null }>,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const byType = new Map<string, Set<string>>();
  for (const r of refs) {
    if (!r.referenceEntityType || !r.referenceEntityId) continue;
    if (!byType.has(r.referenceEntityType)) byType.set(r.referenceEntityType, new Set());
    byType.get(r.referenceEntityType)!.add(r.referenceEntityId);
  }
  const set = (type: string, id: string, name: string) => map.set(`${type}:${id}`, name);

  for (const [type, idSet] of byType) {
    const ids = [...idSet];
    switch (type) {
      case 'Contact': {
        const rows = await prisma.contact.findMany({
          where: { id: { in: ids } },
          select: { id: true, companyName: true, firstName: true, lastName: true },
        });
        for (const c of rows)
          set(type, c.id, c.companyName || [c.firstName, c.lastName].filter(Boolean).join(' ') || '—');
        break;
      }
      case 'ContactPerson': {
        const rows = await prisma.contactPerson.findMany({
          where: { id: { in: ids } },
          select: { id: true, firstName: true, lastName: true },
        });
        for (const c of rows) set(type, c.id, [c.firstName, c.lastName].filter(Boolean).join(' ') || '—');
        break;
      }
      case 'Location': {
        const rows = await prisma.location.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true },
        });
        for (const l of rows) set(type, l.id, l.name || '—');
        break;
      }
      case 'Request': {
        const rows = await prisma.request.findMany({
          where: { id: { in: ids } },
          select: { id: true, title: true },
        });
        for (const r of rows) set(type, r.id, r.title);
        break;
      }
      case 'Quote': {
        const rows = await prisma.quote.findMany({
          where: { id: { in: ids } },
          select: { id: true, quoteNumber: true },
        });
        for (const q of rows) set(type, q.id, q.quoteNumber);
        break;
      }
      case 'Task': {
        const rows = await prisma.task.findMany({
          where: { id: { in: ids } },
          select: { id: true, title: true },
        });
        for (const t of rows) set(type, t.id, t.title);
        break;
      }
      case 'Project': {
        const rows = await prisma.project.findMany({
          where: { id: { in: ids } },
          select: { id: true, title: true, projectNumber: true },
        });
        for (const p of rows) set(type, p.id, `${p.projectNumber} — ${p.title}`);
        break;
      }
      case 'WorkOrder': {
        const rows = await prisma.workOrder.findMany({
          where: { id: { in: ids } },
          select: { id: true, workOrderNumber: true },
        });
        for (const w of rows) set(type, w.id, w.workOrderNumber);
        break;
      }
      case 'PlanningItem': {
        const rows = await prisma.planningItem.findMany({
          where: { id: { in: ids } },
          select: { id: true, productName: true },
        });
        for (const p of rows) set(type, p.id, p.productName);
        break;
      }
      case 'InspectionPlan': {
        const rows = await prisma.inspectionPlan.findMany({
          where: { id: { in: ids } },
          select: { id: true, projectName: true, referenceNumber: true },
        });
        for (const i of rows) set(type, i.id, i.projectName || i.referenceNumber || '—');
        break;
      }
      case 'User': {
        const rows = await prisma.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, firstName: true, lastName: true },
        });
        for (const u of rows) set(type, u.id, [u.firstName, u.lastName].filter(Boolean).join(' ') || '—');
        break;
      }
      default:
        break;
    }
  }
  return map;
}

export function toMessage(
  m: {
    id: string;
    threadId: string;
    senderId: string;
    content: string;
    mentionedUserIds: string[];
    referenceEntityType: string | null;
    referenceEntityId: string | null;
    createdAt: Date;
    sender: { id: string; firstName: string; lastName: string; initials: string | null; avatarUrl: string | null };
  },
  refNames: Map<string, string>,
) {
  return {
    id: m.id,
    threadId: m.threadId,
    senderId: m.senderId,
    sender: m.sender,
    content: m.content,
    mentionedUserIds: m.mentionedUserIds,
    referenceEntityType: m.referenceEntityType,
    referenceEntityId: m.referenceEntityId,
    referenceName:
      m.referenceEntityType && m.referenceEntityId
        ? refNames.get(`${m.referenceEntityType}:${m.referenceEntityId}`) ?? null
        : null,
    createdAt: m.createdAt,
  };
}

export function toSummary(
  thread: {
    id: string;
    type: ChatThreadType;
    teamRole: Role | null;
    subject: string | null;
    status: ChatThreadStatus;
    referenceEntityType: string | null;
    referenceEntityId: string | null;
    noteId: string | null;
    closedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    participants?: Array<{ userId: string; user: Record<string, unknown> }>;
    messages?: Array<{
      id: string;
      content: string;
      senderId: string;
      createdAt: Date;
      sender: { firstName: string; lastName: string };
    }>;
  },
  user: User,
  unreadCount: number,
  refNames: Map<string, string>,
) {
  const last = thread.messages?.[0] ?? null;
  const lastActivityAt = last?.createdAt ?? thread.createdAt;

  let counterpart: Record<string, unknown> | null = null;
  if (thread.type === ChatThreadType.DIRECT && thread.participants) {
    counterpart = thread.participants.find((p) => p.userId !== user.id)?.user ?? null;
  }

  return {
    id: thread.id,
    type: thread.type,
    teamRole: thread.teamRole,
    subject: thread.subject,
    status: thread.status,
    referenceEntityType: thread.referenceEntityType,
    referenceEntityId: thread.referenceEntityId,
    referenceName:
      thread.referenceEntityType && thread.referenceEntityId
        ? refNames.get(`${thread.referenceEntityType}:${thread.referenceEntityId}`) ?? null
        : null,
    noteId: thread.noteId,
    closedAt: thread.closedAt,
    unreadCount,
    counterpart,
    lastMessage: last
      ? {
          id: last.id,
          content: last.content,
          senderId: last.senderId,
          senderName: [last.sender.firstName, last.sender.lastName].filter(Boolean).join(' '),
          createdAt: last.createdAt,
        }
      : null,
    lastActivityAt,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
  };
}
