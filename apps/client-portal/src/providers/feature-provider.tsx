import {
  createContext,
  useContext,
  useCallback,
  type ReactNode,
} from 'react';
import { useTenant } from '@/providers/tenant-provider';
import type { FeatureKey } from '@/lib/features';

interface FeatureContextValue {
  /** Effectieve feature-keys van de org, of null zolang nog niet bekend. */
  features: string[] | null;
  hasFeature: (key: FeatureKey) => boolean;
  isLoading: boolean;
}

const FeatureContext = createContext<FeatureContextValue | undefined>(undefined);

/**
 * Het klantportaal kent een eigen auth-realm (ClientUser) waarvan het token NIET
 * tegen de staf-`/organizations/me/features` valideert. De effectieve feature-set
 * komt daarom mee in de publieke branding-call (`GET /organizations/by-slug/:slug`,
 * PRD §5.1) die de TenantProvider al vóór login uitvoert — realm-onafhankelijk en
 * dus ook beschikbaar op de login-/magic-pagina's.
 *
 * Fail-open bij onbekend (laadt nog, geen slug, of branding-fout): de backend
 * FeatureGuard blokkeert client-endpoints alsnog op org-niveau. We blokkeren in de
 * UI alleen als we zéker weten dat de feature ontbreekt.
 */
export function FeatureProvider({ children }: { children: ReactNode }) {
  const { orgBranding, isLoading } = useTenant();
  const features = orgBranding?.features ?? null;

  const hasFeature = useCallback(
    (key: FeatureKey): boolean => {
      if (features === null) return true; // onbekend → fail-open
      return features.includes(key);
    },
    [features],
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
    throw new Error('useFeatures moet binnen een FeatureProvider gebruikt worden');
  }
  return ctx;
}
