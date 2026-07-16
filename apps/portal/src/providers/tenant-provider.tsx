import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { orgBrandingKeys } from '@/lib/query-keys';
import { getTenantInfo, type TenantInfo } from '@/lib/tenant';

export interface OrgBranding {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string | null;
  /** Interne chat aan/uit voor deze organisatie (REQ1). */
  chatEnabled?: boolean;
  /** Vier-ogen-controle verplicht op inspectieplannen (PRD-13). */
  inspectionReviewEnabled?: boolean;
  /** AI-voorcontrole van inspectierapporten aan/uit (PRD-13). */
  aiReviewEnabled?: boolean;
}

interface TenantContextType {
  tenantInfo: TenantInfo;
  orgBranding: OrgBranding | null;
  isLoading: boolean;
  error: string | null;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

interface TenantProviderProps {
  children: ReactNode;
}

/**
 * Convert a hex color to HSL values.
 */
function hexToHSL(hex: string): { h: number; s: number; l: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;

  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/**
 * Generate a color palette from a hex color and apply as CSS custom properties.
 */
function applyOrgTheme(primaryColor: string) {
  const hsl = hexToHSL(primaryColor);
  if (!hsl) return;

  const { h, s } = hsl;
  const root = document.documentElement;

  // Generate shades — keep hue and saturation, vary lightness
  const shades: Record<string, number> = {
    '50': 96,
    '100': 91,
    '200': 82,
    '300': 70,
    '400': 58,
    '500': 48,
    '600': 40,
    '700': 33,
    '800': 27,
    '900': 22,
  };

  Object.entries(shades).forEach(([shade, lightness]) => {
    const hslColor = `hsl(${h}, ${s}%, ${lightness}%)`;
    root.style.setProperty(`--color-primary-${shade}`, hslColor);
  });
}

async function fetchBranding(slug: string): Promise<OrgBranding> {
  const response = await fetch(`/api/v1/organizations/by-slug/${slug}`);

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Organisatie niet gevonden');
    }
    throw new Error('Fout bij het laden van organisatie');
  }

  const json = await response.json();
  return json.data;
}

export function TenantProvider({ children }: TenantProviderProps) {
  const tenantInfo = useMemo(() => getTenantInfo(), []);

  const {
    data: orgBranding = null,
    isLoading,
    error: queryError,
  } = useQuery<OrgBranding>({
    queryKey: orgBrandingKeys.bySlug(tenantInfo.slug),
    queryFn: () => fetchBranding(tenantInfo.slug!),
    enabled: !!tenantInfo.slug,
    staleTime: 30 * 60 * 1000, // 30 min — branding rarely changes
    retry: 1,
  });

  const error = queryError ? (queryError as Error).message : null;

  // Apply org theme when branding data is available
  useEffect(() => {
    if (orgBranding?.primaryColor) {
      applyOrgTheme(orgBranding.primaryColor);
    }
  }, [orgBranding]);

  return (
    <TenantContext.Provider
      value={{ tenantInfo, orgBranding, isLoading, error }}
    >
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant(): TenantContextType {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
}
