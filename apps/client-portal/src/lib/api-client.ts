import { tenantStorage } from './storage';
import type { ApiError } from '@/types';

// Client-realm apiClient (los van de staf-portal). Hit /api/v1/client/*. Tokens worden
// tenant-gescoped opgeslagen (tenantStorage prefixt met de org-slug); de client-realm-refresh
// verwacht het refresh-token in de body (geen httpOnly-cookie zoals de staf-portal). Op een 401
// wordt één keer ververst (gedeelde promise) en de originele request opnieuw geprobeerd.
const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

const ACCESS_KEY = 'client_access_token';
const REFRESH_KEY = 'client_refresh_token';

export function getAccessToken(): string | null {
  return tenantStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return tenantStorage.getItem(REFRESH_KEY);
}

export function setTokens(accessToken: string, refreshToken: string): void {
  tenantStorage.setItem(ACCESS_KEY, accessToken);
  tenantStorage.setItem(REFRESH_KEY, refreshToken);
}

/** Verwijdert de tokens en seint via een window-event dat de sessie geëindigd is. */
export function clearTokens(): void {
  tenantStorage.removeItem(ACCESS_KEY);
  tenantStorage.removeItem(REFRESH_KEY);
  window.dispatchEvent(new CustomEvent('client-auth:logout'));
}

export class ApiClientError extends Error {
  statusCode: number;
  error?: string;

  constructor(data: ApiError) {
    super(data.message);
    this.name = 'ApiClientError';
    this.statusCode = data.statusCode;
    this.error = data.error;
  }
}

/** Servermelding (NL) voor toasts; valt terug op een generieke melding. */
export function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiClientError && err.message) return err.message;
  return fallback;
}

// Gedeelde refresh-promise zodat parallelle 401's maar één refresh-call triggeren.
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  try {
    const response = await fetch(`${BASE_URL}/client/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) {
      clearTokens();
      return null;
    }
    const json = await response.json();
    const data = json?.data ?? json;
    setTokens(data.accessToken, data.refreshToken);
    return data.accessToken as string;
  } catch {
    clearTokens();
    return null;
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;
  const isFormData = options.body instanceof FormData;

  const buildHeaders = (token: string | null): Record<string, string> => ({
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string>),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });

  let response = await fetch(url, { ...options, headers: buildHeaders(getAccessToken()) });

  // De publieke auth-endpoints (login/register/magic/forgot/reset/refresh) mogen de refresh-retry
  // NIET triggeren: een 401 daar is een echte fout (bijv. onjuiste inloggegevens), geen verlopen
  // token. /client/auth/me is wél geauthenticeerd en mag dus refreshen.
  const isPublicAuthEndpoint =
    endpoint.startsWith('/client/auth/') && endpoint !== '/client/auth/me';

  if (response.status === 401 && !isPublicAuthEndpoint) {
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
    }
    const newToken = await refreshPromise;
    if (newToken) {
      response = await fetch(url, { ...options, headers: buildHeaders(newToken) });
    } else {
      throw new ApiClientError({ message: 'Sessie verlopen. Log opnieuw in.', statusCode: 401 });
    }
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({
      message: 'Er is een onbekende fout opgetreden',
      statusCode: response.status,
    }));
    throw new ApiClientError(errorData);
  }

  if (response.status === 204) return undefined as T;

  const json = await response.json();
  if (json && typeof json === 'object' && 'success' in json && 'data' in json) {
    return json.data as T;
  }
  return json as T;
}

export const apiClient = {
  get: <T>(endpoint: string) => request<T>(endpoint),
  post: <T>(endpoint: string, body?: unknown) =>
    request<T>(endpoint, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(endpoint: string, body?: unknown) =>
    request<T>(endpoint, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(endpoint: string) => request<T>(endpoint, { method: 'DELETE' }),
  upload: <T>(endpoint: string, formData: FormData) =>
    request<T>(endpoint, { method: 'POST', body: formData }),
};
