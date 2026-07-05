import { createApiClient, ApiClientError, getErrorMessage } from '@inspexi/shared-web';

// Dunne staf-portal-shim rond de gedeelde api-client-kern (@inspexi/shared-web).
// Behoudt exact het bestaande gedrag: in-memory access-token, een `isInitializing`-
// vlag die tijdens de eerste auth-check redirect-loops voorkomt, en op een 401 één
// refresh-poging op `/auth/refresh` gevolgd door een retry óf een redirect naar
// /login. Bestaande imports `@/lib/api-client` blijven ongewijzigd werken.

export { ApiClientError, getErrorMessage };

const BASE_URL = '/api/v1';

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
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

export const apiClient = createApiClient({
  baseUrl: BASE_URL,
  getToken: getAccessToken,
  onUnauthorized: async ({ endpoint }) => {
    // Skip for auth endpoints
    if (endpoint === '/auth/refresh' || endpoint === '/auth/login') {
      return null;
    }

    // During init, just throw without redirect
    if (isInitializing) {
      throw new ApiClientError({
        message: 'Niet ingelogd',
        statusCode: 401,
      });
    }

    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return { retryWithToken: getAccessToken() as string };
    }

    setAccessToken(null);
    window.location.href = '/login';
    throw new ApiClientError({
      message: 'Sessie verlopen. Log opnieuw in.',
      statusCode: 401,
    });
  },
});
