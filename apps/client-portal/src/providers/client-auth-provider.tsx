import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { apiClient, setTokens, clearTokens, getAccessToken } from '@/lib/api-client';
import type { ClientUser, LoginResult } from '@/types';

// Eigen auth-realm voor het klantportaal (los van de staf-AuthProvider). Tokens worden door de
// apiClient tenant-gescoped in storage gezet; deze provider houdt alleen de user-state bij.

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
  /** Directe login na een geldige magic-link (tokens + user komen uit de validate-respons). */
  loginWithTokens: (accessToken: string, refreshToken: string, user: ClientUser) => void;
  logout: () => void;
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

  // Bestaande sessie herstellen op mount.
  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!getAccessToken()) {
        setIsLoading(false);
        return;
      }
      try {
        const me = await apiClient.get<ClientUser>('/client/auth/me');
        if (!cancelled) setUser(me);
      } catch {
        clearTokens();
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    check();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiClient.post<LoginResult>('/client/auth/login', { email, password });
    setTokens(data.accessToken, data.refreshToken);
    setUser(data.user);
  }, []);

  const register = useCallback(async (data: ClientRegisterData) => {
    const res = await apiClient.post<LoginResult>('/client/auth/register', data);
    setTokens(res.accessToken, res.refreshToken);
    setUser(res.user);
  }, []);

  const loginWithTokens = useCallback(
    (accessToken: string, refreshToken: string, nextUser: ClientUser) => {
      setTokens(accessToken, refreshToken);
      setUser(nextUser);
    },
    [],
  );

  const logout = useCallback(() => {
    clearTokens(); // → 'client-auth:logout' → handleLogout zet user op null
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
        loginWithTokens,
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
