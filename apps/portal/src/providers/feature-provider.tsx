import {
  createContext,
  useContext,
  useCallback,
  type ReactNode,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';
import { hasRole } from '@/lib/has-role';
import { Role } from '@/types';
import type { FeatureKey } from '@/lib/features';

interface FeatureContextValue {
  /** Effectieve feature-keys van de org (leeg zolang nog niet bekend). */
  features: string[];
  hasFeature: (key: FeatureKey) => boolean;
  /** True zolang we nog geen definitief antwoord hebben — toon dan een loader, geen "niet in abonnement"-flits. */
  isLoading: boolean;
}

const FeatureContext = createContext<FeatureContextValue | undefined>(undefined);

/**
 * Haalt bij bootstrap de effectieve SaaS-feature-keys van de eigen organisatie op
 * (`GET /organizations/me/features`, bestaat sinds Fase 1) en exposed `hasFeature()`
 * voor de route-guard (`<FeatureRoute>`) en de sidebar-filter.
 *
 * - In-memory via TanStack Query (geen localStorage); een page-refresh start een
 *   verse cache en herfetcht dus automatisch — net als de AuthProvider.
 * - SUPERUSER ziet altijd alles (geen org → impliciet alle features); we slaan de
 *   fetch dan over.
 * - De backend FeatureGuard (Fase 1) blijft de echte grens; deze laag is puur UX.
 *   Daarom failen we *open* bij een fetch-fout — liever een 403 van de API dan een
 *   gebruiker die ten onrechte buitengesloten wordt.
 */
export function FeatureProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const isSuperuser = hasRole(user, Role.SUPERUSER);

  const query = useQuery<string[]>({
    queryKey: ['my-features', user?.id],
    queryFn: () => apiClient.get<string[]>('/organizations/me/features'),
    enabled: isAuthenticated && !isSuperuser,
    staleTime: 5 * 60 * 1000,
  });

  const features = query.data ?? [];

  // Loading zolang auth nog initialiseert, of de feature-fetch nog daadwerkelijk
  // loopt (isPending && isFetching: bij `enabled:false` is isFetching false → niet loading).
  const isLoading = authLoading || (query.isPending && query.isFetching);

  const hasFeature = useCallback(
    (key: FeatureKey): boolean => {
      if (isSuperuser) return true;
      if (!isAuthenticated) return false;
      // Fail-open bij een fetch-fout: de API-guard blokkeert alsnog waar nodig.
      if (query.isError) return true;
      return features.includes(key);
    },
    [isSuperuser, isAuthenticated, query.isError, features],
  );

  return (
    <FeatureContext.Provider value={{ features, hasFeature, isLoading }}>
      {children}
    </FeatureContext.Provider>
  );
}

export function useFeatures(): FeatureContextValue {
  const ctx = useContext(FeatureContext);
  if (ctx === undefined) {
    throw new Error('useFeatures must be used within a FeatureProvider');
  }
  return ctx;
}
