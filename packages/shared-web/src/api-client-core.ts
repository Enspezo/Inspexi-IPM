import type { ApiError } from './types';

/**
 * Gedeelde fetch/unwrap/upload-kern voor de api-clients van beide web-apps.
 *
 * De 401/refresh-afhandeling verschilt wézenlijk tussen de apps (Beheer-portal:
 * `isInitializing`-vlag + redirect naar /login; klantportaal: gedeelde
 * `refreshPromise` + `clearTokens`-event, geen redirect). Die verschillen zitten
 * daarom NIET hier maar in de injecteerbare `onUnauthorized`-hook die elke app
 * meegeeft aan `createApiClient`. De kern blijft zo gedragsneutraal.
 */

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

export interface UnauthorizedContext {
  /** Het aangeroepen endpoint (zonder base-URL), bijv. `/auth/login`. */
  endpoint: string;
}

/**
 * Resultaat van de 401-hook:
 * - `{ retryWithToken }` → oorspronkelijke request opnieuw proberen met dit token;
 * - `null`              → niet opnieuw proberen, val door naar de normale foutafhandeling
 *                          (gooit de server-fout van de 401-respons).
 *
 * De hook mág ook een `ApiClientError` gooien om te short-circuiten (bijv. de
 * init-guard "Niet ingelogd" of "Sessie verlopen. Log opnieuw in.").
 */
export type UnauthorizedResult = { retryWithToken: string } | null;

export interface CreateApiClientOptions {
  /** Base-URL waarachter alle endpoints hangen, bijv. `/api/v1`. */
  baseUrl: string;
  /** Huidig in-memory access-token; wordt als `Bearer`-header meegestuurd. */
  getToken: () => string | null;
  /**
   * Aangeroepen bij een 401-respons. Zie {@link UnauthorizedResult}. De app
   * beslist hier zelf over refreshen, retry, redirect en het wissen van tokens.
   */
  onUnauthorized: (ctx: UnauthorizedContext) => Promise<UnauthorizedResult>;
}

export interface ApiClient {
  get: <T>(endpoint: string) => Promise<T>;
  post: <T>(endpoint: string, body?: unknown) => Promise<T>;
  patch: <T>(endpoint: string, body?: unknown) => Promise<T>;
  put: <T>(endpoint: string, body?: unknown) => Promise<T>;
  delete: <T>(endpoint: string) => Promise<T>;
  upload: <T>(
    endpoint: string,
    formData: FormData,
    method?: 'POST' | 'PATCH' | 'PUT',
  ) => Promise<T>;
}

export function createApiClient(options: CreateApiClientOptions): ApiClient {
  const { baseUrl, getToken, onUnauthorized } = options;

  async function request<T>(
    endpoint: string,
    init: RequestInit = {},
  ): Promise<T> {
    const url = `${baseUrl}${endpoint}`;
    const isFormData = init.body instanceof FormData;

    const buildHeaders = (token: string | null): Record<string, string> => ({
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(init.headers as Record<string, string>),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    });

    let response = await fetch(url, {
      ...init,
      headers: buildHeaders(getToken()),
      credentials: 'include',
    });

    if (response.status === 401) {
      // De hook mag gooien (init-guard / sessie verlopen); dat propageert.
      const result = await onUnauthorized({ endpoint });
      if (result) {
        response = await fetch(url, {
          ...init,
          headers: buildHeaders(result.retryWithToken),
          credentials: 'include',
        });
      }
      // result === null → val door naar de foutafhandeling hieronder.
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

  return {
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
}
