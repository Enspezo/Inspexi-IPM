/**
 * B-505: slugs die nooit als organisatie-subdomein uitgegeven mogen worden.
 *
 * Achtergrond: `TenantMiddleware.classifyHostname()` matcht het geconfigureerde
 * SUPERUSER_SUBDOMAIN vóór de slug-lookup — een org met die slug is per
 * definitie onbereikbaar. De overige namen zijn infrastructuur-subdomeinen
 * (mail/DNS/CDN e.d.) die in productie-DNS al een andere betekenis (kunnen)
 * hebben en verwarring of kaping van verkeer zouden geven.
 *
 * De runtime-waarde van SUPERUSER_SUBDOMAIN wordt in OrganizationsService
 * toegevoegd (die kan ConfigService lezen); deze lijst is het statische deel.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  // Superuser-default (runtime wordt óók de geconfigureerde waarde geweigerd)
  'mijn',
  // Web/infrastructuur
  'www',
  'api',
  'app',
  'admin',
  'portal',
  'static',
  'assets',
  'cdn',
  'status',
  'docs',
  'help',
  'support',
  // E-mail
  'mail',
  'smtp',
  'imap',
  'pop',
  'mx',
  'webmail',
  // DNS / netwerk
  'ns',
  'ns1',
  'ns2',
  'dns',
  'vpn',
  'ftp',
  'localhost',
]);
