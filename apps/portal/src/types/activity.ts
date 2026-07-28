import type { UserSummary } from './requests';

// ─── Audit Trail ──────────────────────────────────────────

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
}

export interface AuditLogEntry {
  id: string;
  entityType: string;
  entityId: string;
  action: AuditAction;
  changes: Record<string, { from: any; to: any }> | null;
  snapshot: Record<string, any> | null;
  userId: string;
  user: { id: string; firstName: string; lastName: string };
  /** Herkomst van de mutatie: 'AI' = via de AI-assistent uitgevoerd. */
  source?: 'HUMAN' | 'AI';
  createdAt: string;
}

// ─── Task Management ─────────────────────────────────────

export enum TaskStatus {
  TE_DOEN = 'TE_DOEN',
  MEE_BEZIG = 'MEE_BEZIG',
  VOLTOOID = 'VOLTOOID',
}

export enum TaskType {
  TO_DO = 'TO_DO',
  EMAIL = 'EMAIL',
  TELEFOONGESPREK = 'TELEFOONGESPREK',
  DOCUMENT = 'DOCUMENT',
  GOEDKEURING = 'GOEDKEURING',
}

export enum TaskEntityType {
  CONTACT = 'CONTACT',
  REQUEST = 'REQUEST',
  QUOTE = 'QUOTE',
  PLANNING = 'PLANNING',
  PROJECT = 'PROJECT',
  PROJECT_PHASE = 'PROJECT_PHASE',
  USER = 'USER',
}

export interface Task {
  id: string;
  orgId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  taskType: TaskType;
  entityType: TaskEntityType;
  entityId: string;
  entityName: string | null;
  assigneeId: string | null;
  createdById: string;
  deadline: string | null;
  createdAt: string;
  updatedAt: string;
  assignee?: UserSummary;
  createdBy?: UserSummary;
}

// ─── Notes (Threaded) ────────────────────────────────────

export enum NoteEntityType {
  CONTACT = 'CONTACT',
  REQUEST = 'REQUEST',
  QUOTE = 'QUOTE',
  PLANNING = 'PLANNING',
  PROJECT = 'PROJECT',
  PROJECT_PHASE = 'PROJECT_PHASE',
  USER = 'USER',
  WORK_ORDER = 'WORK_ORDER',
}

export interface Note {
  id: string;
  orgId: string;
  entityType: NoteEntityType;
  entityId: string;
  entityName?: string | null;
  content: string;
  createdById: string;
  createdBy: { id: string; firstName: string; lastName: string };
  parentId: string | null;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  replies?: Note[];
  replyCount?: number;
}
