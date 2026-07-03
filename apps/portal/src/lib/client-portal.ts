// Bouwt URL's naar het externe klantportaal (aparte app) voor bijv. een preview
// van een gepubliceerd extern KB-artikel vanuit het staf-beheer.
//
// - Dev: het klantportaal draait op hetzelfde org-subdomein, poort 5174.
// - Prod: stel `VITE_CLIENT_PORTAL_BASE` in (bijv. "https://{slug}.inspexi.nl");
//   een optionele `{slug}`-placeholder wordt vervangen door het huidige subdomein.

const CLIENT_PORTAL_DEV_PORT = '5174';

export function clientPortalBaseUrl(): string {
  const configured = import.meta.env.VITE_CLIENT_PORTAL_BASE as string | undefined;
  if (configured) {
    const slug = window.location.hostname.split('.')[0];
    return configured.replace('{slug}', slug).replace(/\/+$/, '');
  }
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:${CLIENT_PORTAL_DEV_PORT}`;
}

/**
 * URL van een extern KB-artikel op het klantportaal.
 * - Publieke categorie → openbare route (zonder login zichtbaar).
 * - Afgeschermde categorie → route achter klant-login.
 */
export function clientPortalArticleUrl(articleSlug: string, isPublic: boolean): string {
  const path = isPublic ? 'kennisbank-openbaar' : 'kennisbank';
  return `${clientPortalBaseUrl()}/${path}/${articleSlug}`;
}
