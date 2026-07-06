import { createApiClient, ApiClientError, getErrorMessage } from '@inspexi/shared-web';

// Dunne klant-realm-shim rond de gedeelde api-client-kern (@inspexi/shared-web).
// Los van de staf-portal; hit /api/v1/client/*. Het access-token wordt ALLEEN in het
// geheugen bewaard (nooit in localStorage); het refresh-token loopt als httpOnly,
// secure, sameSite-cookie op /api/v1/client/auth en wordt door de server geroteerd.
// Alle requests gaan met `credentials: 'include'` zodat de cookie mee-reist. Op een
// 401 wordt één keer ververst (gedeelde promise) en de originele request opnieuw
// geprobeerd; faalt dat, dan seint `clearTokens` via een window-event dat de sessie
// geëindigd is (geen redirect — de ClientAuthProvider vangt dat af).

export { ApiClientError, getErrorMessage };

const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

// In-memory access-token — verdwijnt bij een page-reload; de sessie wordt dan hersteld via de
// httpOnly refresh-cookie (zie ClientAuthProvider).
let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/** Wist het access-token en seint via een window-event dat de sessie geëindigd is. */
export function clearTokens(): void {
  accessToken = null;
  window.dispatchEvent(new CustomEvent('client-auth:logout'));
}

// Gedeelde refresh-promise zodat parallelle 401's maar één refresh-call triggeren.
let refreshPromise: Promise<string | null> | null = null;

/**
 * Vraagt een nieuw access-token op via de httpOnly refresh-cookie. Retourneert het nieuwe
 * access-token, of null als er geen geldige sessie (meer) is. De server roteert het refresh-token
 * en zet de bijgewerkte cookie.
 */
export async function refreshAccessToken(): Promise<string | null> {
  try {
    const response = await fetch(`${BASE_URL}/client/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      setAccessToken(null);
      return null;
    }
    const json = await response.json();
    const data = json?.data ?? json;
    const token = (data?.accessToken as string | undefined) ?? null;
    setAccessToken(token);
    return token;
  } catch {
    setAccessToken(null);
    return null;
  }
}

export const apiClient = createApiClient({
  baseUrl: BASE_URL,
  getToken: getAccessToken,
  onUnauthorized: async ({ endpoint }) => {
    // De publieke auth-endpoints (login/register/magic/forgot/reset/refresh/logout) mogen de
    // refresh-retry NIET triggeren: een 401 daar is een echte fout (bijv. onjuiste inloggegevens),
    // geen verlopen token. /client/auth/me is wél geauthenticeerd en mag dus refreshen.
    const isPublicAuthEndpoint =
      endpoint.startsWith('/client/auth/') && endpoint !== '/client/auth/me';
    if (isPublicAuthEndpoint) return null;

    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
    }
    const newToken = await refreshPromise;
    if (newToken) {
      return { retryWithToken: newToken };
    }

    clearTokens();
    throw new ApiClientError({ message: 'Sessie verlopen. Log opnieuw in.', statusCode: 401 });
  },
});
