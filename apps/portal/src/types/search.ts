import type { Task, TaskEntityType, TaskStatus } from './activity';
import type { Contact, ContactPerson, ContactPersonRoleRef, ContactType, Location } from './crm';
import type { DocumentEntityType } from './documents';
import type { Product } from './products';
import type { Project } from './projects';
import type { Quote, QuoteStatus } from './quotes';
import type { Priority, Request, RequestStatus, UserSummary } from './requests';

// ─── Global Search ────────────────────────────────────────

export type SearchEntityType =
  | 'contact'
  | 'contactPerson'
  | 'location'
  | 'request'
  | 'quote'
  | 'task'
  | 'document'
  | 'product';

export interface SearchContactResult {
  isFavorited?: boolean;
  id: string;
  type: ContactType;
  companyName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  addresses: { city: string }[];
}

export interface SearchContactPersonResult {
  isFavorited?: boolean;
  id: string;
  contactId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  role: ContactPersonRoleRef | null;
  contact: {
    id: string;
    companyName: string | null;
    firstName: string | null;
    lastName: string | null;
  };
}

export interface SearchLocationResult {
  isFavorited?: boolean;
  id: string;
  contactId: string;
  name: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  locationType?: {
    id: string;
    code: string;
    name: string;
    color: string | null;
    icon: string | null;
  } | null;
  contact: {
    id: string;
    companyName: string | null;
    firstName: string | null;
    lastName: string | null;
  };
}

export interface SearchRequestResult {
  isFavorited?: boolean;
  id: string;
  title: string;
  status: RequestStatus;
  priority: Priority;
  createdAt: string;
  contact: {
    id: string;
    companyName: string | null;
    firstName: string | null;
    lastName: string | null;
  };
}

export interface SearchQuoteResult {
  isFavorited?: boolean;
  id: string;
  quoteNumber: string;
  subject: string;
  status: QuoteStatus;
  total: number;
  createdAt: string;
  contact: {
    id: string;
    companyName: string | null;
    firstName: string | null;
    lastName: string | null;
  };
}

export interface SearchTaskResult {
  isFavorited?: boolean;
  id: string;
  title: string;
  status: TaskStatus;
  entityType: TaskEntityType;
  entityId: string;
  entityName: string | null;
  deadline: string | null;
  assignee: UserSummary | null;
}

export interface SearchDocumentResult {
  isFavorited?: boolean;
  id: string;
  originalName: string;
  mimeType: string;
  entityType: DocumentEntityType;
  entityId: string;
  entityName: string | null;
  createdAt: string;
  uploadedBy: UserSummary;
}

export interface SearchProductResult {
  isFavorited?: boolean;
  id: string;
  name: string;
  unit: string;
  isActive: boolean;
  productGroup: { id: string; name: string } | null;
}

export type SearchResultItem =
  | SearchContactResult
  | SearchContactPersonResult
  | SearchLocationResult
  | SearchRequestResult
  | SearchQuoteResult
  | SearchTaskResult
  | SearchDocumentResult
  | SearchProductResult;

export interface SearchGroup {
  type: SearchEntityType;
  total: number;
  items: SearchResultItem[];
}

export interface SearchResponse {
  groups: SearchGroup[];
}

// ─── Favorites (REQ36) ──────────────────────────────────

/** Canonical Prisma model names that can be favorited (matches backend allow-list). */
export type FavoritableEntityType =
  | 'Contact'
  | 'ContactPerson'
  | 'Location'
  | 'Request'
  | 'Quote'
  | 'Task'
  | 'Project'
  | 'Product';

/** Lightweight key used to drive the star toggle state. */
export interface FavoriteKey {
  entityType: FavoritableEntityType;
  entityId: string;
}

/** A favorite enriched with a human-readable name for the favorites overview. */
export interface FavoriteItem {
  id: string;
  entityType: FavoritableEntityType;
  entityId: string;
  name: string;
  createdAt: string;
}

export interface FavoriteGroup {
  entityType: FavoritableEntityType;
  items: FavoriteItem[];
}

export interface FavoritesResponse {
  groups: FavoriteGroup[];
}
