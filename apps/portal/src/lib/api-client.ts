import type { ApiError } from '@/types';

const BASE_URL = '/api/v1';

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
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

/**
 * Geeft de servermelding (NL, bijv. uit assertFound of FK-validatie) terug
 * voor toasts; valt terug op een generieke melding bij netwerk/onbekende fouten.
 */
export function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiClientError && err.message) {
    return err.message;
  }
  return fallback;
}

// Track whether we're in the initial auth check to avoid redirect loops
let isInitializing = true;

export function setInitialized(): void {
  isInitializing = false;
}

async function refreshAccessToken(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return false;
    }

    const json = await response.json();
    setAccessToken(json.data?.accessToken ?? json.accessToken);
    return true;
  } catch {
    return false;
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;

  const isFormData = options.body instanceof FormData;

  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string>),
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  let response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  // If 401, try refreshing the token (skip for auth endpoints and during init)
  if (response.status === 401 && endpoint !== '/auth/refresh' && endpoint !== '/auth/login') {
    if (isInitializing) {
      // During init, just throw without redirect
      throw new ApiClientError({
        message: 'Niet ingelogd',
        statusCode: 401,
      });
    }

    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${accessToken}`;
      response = await fetch(url, {
        ...options,
        headers,
        credentials: 'include',
      });
    } else {
      setAccessToken(null);
      window.location.href = '/login';
      throw new ApiClientError({
        message: 'Sessie verlopen. Log opnieuw in.',
        statusCode: 401,
      });
    }
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({
      message: 'Er is een onbekende fout opgetreden',
      statusCode: response.status,
    }));
    throw new ApiClientError(errorData);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  // Unwrap { success, data } API response format
  const json = await response.json();
  if (json && typeof json === 'object' && 'success' in json && 'data' in json) {
    return json.data as T;
  }
  return json as T;
}

export const apiClient = {
  get: <T>(endpoint: string) => request<T>(endpoint),

  post: <T>(endpoint: string, body?: unknown) =>
    request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),

  patch: <T>(endpoint: string, body?: unknown) =>
    request<T>(endpoint, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    }),

  put: <T>(endpoint: string, body?: unknown) =>
    request<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T>(endpoint: string) =>
    request<T>(endpoint, {
      method: 'DELETE',
    }),

  upload: <T>(
    endpoint: string,
    formData: FormData,
    method: 'POST' | 'PATCH' | 'PUT' = 'POST',
  ) =>
    request<T>(endpoint, {
      method,
      body: formData,
    }),
};
