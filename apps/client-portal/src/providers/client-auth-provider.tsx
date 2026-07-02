import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from 'react';
import {
  apiClient,
  setAccessToken,
  clearTokens,
  refreshAccessToken,
} from '@/lib/api-client';
import type { ClientUser, LoginResult } from '@/types';

// Eigen auth-realm voor het klantportaal (los van de staf-AuthProvider). Het access-token leeft
// alleen in het geheugen (api-client); het refresh-token is een httpOnly-cookie die de server zet
// en roteert. Bij een reload herstelt deze provider de sessie via die cookie. Deze provider houdt
// alleen de user-state bij.

export interface ClientRegisterData {
  magicLinkToken: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  function?: string;
}

interface ClientAuthContextValue {
  user: ClientUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: ClientRegisterData) => Promise<void>;
  /**
   * Directe login na een geldige magic-link. Het access-token komt uit de validate-respons; de
   * refresh-cookie is dan al door de server gezet (op diezelfde POST).
   */
  loginWithToken: (accessToken: string, user: ClientUser) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const ClientAuthContext = createContext<ClientAuthContextValue | null>(null);

export function ClientAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ClientUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Geforceerde logout — de apiClient seint dit bij een 401 zonder geldige refresh.
  // Hier alléén de state legen (de tokens zijn al gewist door clearTokens), nooit opnieuw
  // clearTokens aanroepen — dat zou het event re-dispatchen.
  useEffect(() => {
    const handleLogout = () => setUser(null);
    window.addEventListener('client-auth:logout', handleLogout);
    return () => window.removeEventListener('client-auth:logout', handleLogout);
  }, []);

  // Bestaande sessie herstellen op mount: het in-memory access-token is na een reload weg, dus
  // probeer één keer te verversen via de httpOnly refresh-cookie. Guard tegen React 18 StrictMode's
  // dubbel-aangeroepen effect (twee parallelle refresh-calls racen met de token-rotatie).
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    let cancelled = false;
    async function restore() {
      try {
        const token = await refreshAccessToken();
        if (token && !cancelled) {
          const me = await apiClient.get<ClientUser>('/client/auth/me');
          if (!cancelled) setUser(me);
        }
      } catch {
        // Geen geldige sessie — dat is prima.
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiClient.post<LoginResult>('/client/auth/login', { email, password });
    setAccessToken(data.accessToken);
    setUser(data.user);
  }, []);

  const register = useCallback(async (data: ClientRegisterData) => {
    const res = await apiClient.post<LoginResult>('/client/auth/register', data);
    setAccessToken(res.accessToken);
    setUser(res.user);
  }, []);

  const loginWithToken = useCallback((accessToken: string, nextUser: ClientUser) => {
    setAccessToken(accessToken);
    setUser(nextUser);
  }, []);

  const logout = useCallback(async () => {
    try {
      // Trek het refresh-token server-side in en wis de cookie.
      await apiClient.post('/client/auth/logout');
    } catch {
      // Ook bij een netwerkfout de lokale sessie beëindigen.
    } finally {
      clearTokens(); // → 'client-auth:logout' → handleLogout zet user op null
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const me = await apiClient.get<ClientUser>('/client/auth/me');
      setUser(me);
    } catch {
      /* laat de huidige user-state staan */
    }
  }, []);

  return (
    <ClientAuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        loginWithToken,
        logout,
        refreshUser,
      }}
    >
      {children}
    </ClientAuthContext.Provider>
  );
}

export function useClientAuth(): ClientAuthContextValue {
  const ctx = useContext(ClientAuthContext);
  if (!ctx) throw new Error('useClientAuth moet binnen een ClientAuthProvider gebruikt worden');
  return ctx;
}
