import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContextData {
  userId: string;
  orgId: string | null;
  ipAddress?: string;
  requestId?: string;
  // Herkomst van mutaties in deze context (PRD-12). Ongezet = HUMAN (normale UI).
  // De AI-assistent draait zijn bevestigde schrijfacties in een context met source='AI'.
  source?: 'HUMAN' | 'AI';
}

export const requestContext = new AsyncLocalStorage<RequestContextData>();
