/**
 * Tenant utility — extracts subdomain slug from the current hostname
 * and provides helpers for building subdomain URLs.
 */

export interface TenantInfo {
  /** The org slug from the subdomain, or null for SUPERUSER domain */
  slug: string | null;
  /** Whether this is the base/superuser domain (mijn.localhost, mijn.inspexi.nl) */
  isBaseDomain: boolean;
}

/**
 * Explicitly configured base domain (build-time `VITE_BASE_DOMAIN`, e.g.
 * `staging.example.com`). When set, tenant resolution is strict: the hostname must be
 * the base domain itself or exactly one label deeper (`<slug>.<base>`); the heuristic
 * below is skipped entirely. Leading dots and casing are normalised. Empty/unset →
 * null → heuristic detection.
 */
function getConfiguredBaseDomain(): string | null {
  const raw = import.meta.env.VITE_BASE_DOMAIN;
  if (typeof raw !== 'string') return null;
  const normalised = raw.trim().toLowerCase().replace(/^\.+/, '').replace(/\.+$/, '');
  return normalised || null;
}

/** Detect the base domain from the current hostname (heuristic; used without VITE_BASE_DOMAIN) */
function detectBaseDomain(): string {
  const configured = getConfiguredBaseDomain();
  if (configured) {
    return configured;
  }

  const hostname = window.location.hostname;

  // *.localhost → localhost
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    return 'localhost';
  }

  // *.inspexi.nl → inspexi.nl
  if (hostname.endsWith('.inspexi.nl')) {
    return 'inspexi.nl';
  }

  // Exact match (e.g., inspexi.nl itself)
  if (hostname === 'inspexi.nl') {
    return 'inspexi.nl';
  }

  // Fallback: use the hostname as-is
  return hostname;
}

/** The SUPERUSER subdomain (always 'mijn') */
const SUPERUSER_SUBDOMAIN = 'mijn';

/** Get the detected base domain (cached) */
let _baseDomain: string | null = null;
export function getBaseDomain(): string {
  if (!_baseDomain) {
    _baseDomain = detectBaseDomain();
  }
  return _baseDomain;
}

/**
 * Extract tenant info from the current browser hostname.
 *
 * - `voorbeeldbedrijf.localhost` → `{ slug: 'voorbeeldbedrijf', isBaseDomain: false }`
 * - `mijn.localhost` → `{ slug: null, isBaseDomain: true }`
 * - `localhost` → `{ slug: null, isBaseDomain: true }`
 * - with `VITE_BASE_DOMAIN=staging.example.com`: `demo.staging.example.com` →
 *   `{ slug: 'demo', isBaseDomain: false }`; `mijn.staging.example.com` → superuser
 */
export function getTenantInfo(): TenantInfo {
  const hostname = window.location.hostname;
  const baseDomain = getBaseDomain();

  // Exact match on base domain (no subdomain) → treat as SUPERUSER
  if (hostname === baseDomain) {
    return { slug: null, isBaseDomain: true };
  }

  const suffix = `.${baseDomain}`;
  if (!hostname.endsWith(suffix)) {
    return { slug: null, isBaseDomain: true };
  }

  const subdomain = hostname.slice(0, -suffix.length);
  if (!subdomain || subdomain.includes('.')) {
    return { slug: null, isBaseDomain: true };
  }

  // SUPERUSER subdomain → base domain context
  if (subdomain === SUPERUSER_SUBDOMAIN) {
    return { slug: null, isBaseDomain: true };
  }

  return { slug: subdomain, isBaseDomain: false };
}

/**
 * Build a full URL for a specific org subdomain.
 * Preserves protocol and port from the current page.
 */
export function getOrgUrl(slug: string, path = '/'): string {
  const baseDomain = getBaseDomain();
  const protocol = window.location.protocol;
  const port = window.location.port;
  const portSuffix = port ? `:${port}` : '';

  return `${protocol}//${slug}.${baseDomain}${portSuffix}${path}`;
}

/**
 * Build a full URL for the SUPERUSER (base) domain.
 */
export function getBaseDomainUrl(path = '/'): string {
  const baseDomain = getBaseDomain();
  const protocol = window.location.protocol;
  const port = window.location.port;
  const portSuffix = port ? `:${port}` : '';

  return `${protocol}//${SUPERUSER_SUBDOMAIN}.${baseDomain}${portSuffix}${path}`;
}
