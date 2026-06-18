import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient, setAccessToken, setInitialized } from '@/lib/api-client';
import type { User } from '@/types';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  const fetchUser = useCallback(async () => {
    try {
      const userData = await apiClient.get<User>('/auth/me');
      setUser(userData);
    } catch {
      setUser(null);
      setAccessToken(null);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    await fetchUser();
  }, [fetchUser]);

  // On mount: try to refresh the token from the httpOnly cookie.
  // Guard against React 18 StrictMode's double-invoked effect: two concurrent
  // /auth/refresh calls race with refresh-token rotation, and the losing call
  // flips isLoading to false while `user` is still null — which would bounce a
  // valid deeplink through /login to /dashboard. Running init once avoids that.
  const didInitAuth = useRef(false);
  useEffect(() => {
    if (didInitAuth.current) return;
    didInitAuth.current = true;

    const initAuth = async () => {
      try {
        const response = await fetch('/api/v1/auth/refresh', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });

        if (response.ok) {
          const json = await response.json();
          const token = json.data?.accessToken ?? json.accessToken;
          setAccessToken(token);
          await fetchUser();
        }
      } catch {
        // Not authenticated, that's fine
      } finally {
        setInitialized();
        setIsLoading(false);
      }
    };

    initAuth();
  }, [fetchUser]);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await apiClient.post<{ accessToken: string }>(
        '/auth/login',
        { email, password },
      );
      setAccessToken(data.accessToken);
      await fetchUser();
      // Navigation (incl. returnTo) is handled by LoginPage once `user` is set —
      // don't hard-redirect to /dashboard here or we'd discard the original route.
    },
    [fetchUser],
  );

  const logout = useCallback(async () => {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // Ignore errors on logout
    } finally {
      setAccessToken(null);
      setUser(null);
      navigate('/login');
    }
  }, [navigate]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
