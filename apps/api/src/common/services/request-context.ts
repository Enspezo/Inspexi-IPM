import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContextData {
  userId: string;
  orgId: string | null;
  ipAddress?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContextData>();
