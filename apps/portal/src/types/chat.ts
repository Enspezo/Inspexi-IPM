import type { Availability, Role } from './core';
import type { UserSummary } from './requests';

// ─── Interne chat (REQ1) ──────────────────────────────────

export enum ChatThreadType {
  DIRECT = 'DIRECT',
  TEAM = 'TEAM',
}

export enum ChatThreadStatus {
  OPEN = 'OPEN',
  AFGEROND = 'AFGEROND',
}

/** Lichte gebruikersweergave incl. presence (van /chat/users en thread-counterpart). */
export interface ChatUser {
  id: string;
  firstName: string;
  lastName: string;
  initials: string | null;
  avatarUrl: string | null;
  availability: Availability;
  availabilityNote: string | null;
  lastSeenAt: string | null;
  roles?: Role[];
}

export interface ChatMessage {
  id: string;
  threadId: string;
  senderId: string;
  sender: {
    id: string;
    firstName: string;
    lastName: string;
    initials: string | null;
    avatarUrl: string | null;
  };
  content: string;
  mentionedUserIds: string[];
  referenceEntityType: string | null;
  referenceEntityId: string | null;
  referenceName: string | null;
  createdAt: string;
}

export interface ChatThread {
  id: string;
  type: ChatThreadType;
  teamRole: Role | null;
  subject: string | null;
  status: ChatThreadStatus;
  referenceEntityType: string | null;
  referenceEntityId: string | null;
  referenceName: string | null;
  noteId: string | null;
  closedAt: string | null;
  unreadCount: number;
  counterpart: ChatUser | null;
  lastMessage: {
    id: string;
    content: string;
    senderId: string;
    senderName: string;
    createdAt: string;
  } | null;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserPresence {
  id: string;
  availability: Availability;
  availabilityNote: string | null;
  lastSeenAt: string | null;
}

export interface ChatUnreadResponse {
  count: number;
}

// ── Helpsysteem (IMP_PRD-10) ────────────────────────────────────────────────
export enum HelpArticleStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}

// INTERNAL = staff-portal (globaal/org); EXTERNAL = klantportaal (per-org)
export enum HelpAudience {
  INTERNAL = 'INTERNAL',
  EXTERNAL = 'EXTERNAL',
}

export interface HelpCategory {
  id: string;
  orgId: string | null; // null = globaal
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  order: number;
  parentId: string | null;
  isPublished: boolean;
  audience: HelpAudience;
  isPublic: boolean; // alleen relevant bij EXTERNAL: publiek vs achter klant-login
  createdAt: string;
  updatedAt: string;
  articles?: HelpArticle[]; // bij categorie-detail
}

export interface HelpArticle {
  id: string;
  orgId: string | null; // null = globaal
  categoryId: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string;
  status: HelpArticleStatus;
  audience: HelpAudience;
  tags: string[];
  moduleKeys: string[];
  order: number;
  viewCount: number;
  helpfulYes: number;
  helpfulNo: number;
  authorId: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  category?: { id: string; name: string; slug: string } | null;
}

// ─── IMP_PRD-10 Fase 4: Support-tickets ─────────────────

export enum SupportTicketStatus {
  NIEUW = 'NIEUW',
  IN_BEHANDELING = 'IN_BEHANDELING',
  WACHT_OP_KLANT = 'WACHT_OP_KLANT',
  OPGELOST = 'OPGELOST',
  GESLOTEN = 'GESLOTEN',
}

export enum SupportTicketPriority {
  LAAG = 'LAAG',
  NORMAAL = 'NORMAAL',
  HOOG = 'HOOG',
  URGENT = 'URGENT',
}

export enum SupportTicketCategory {
  VRAAG = 'VRAAG',
  PROBLEEM = 'PROBLEEM',
  BUG = 'BUG',
  FEATURE_REQUEST = 'FEATURE_REQUEST',
  FACTUUR = 'FACTUUR',
  OVERIG = 'OVERIG',
}

export type SupportMessageAuthorType = 'USER' | 'SUPPORT' | 'SYSTEM';

export interface SupportTicketMessage {
  id: string;
  ticketId: string;
  orgId: string;
  authorId: string | null;
  authorType: SupportMessageAuthorType;
  body: string;
  isInternal: boolean;
  createdAt: string;
  author?: UserSummary;
}

export interface SupportTicket {
  id: string;
  orgId: string;
  ticketNumber: number;
  subject: string;
  description: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  category: SupportTicketCategory;
  contextModule: string | null;
  contextUrl: string | null;
  createdById: string;
  assignedToId: string | null;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: UserSummary;
  assignedTo?: UserSummary | null;
  organization?: { id: string; name: string } | null;
  messages?: SupportTicketMessage[];
}
