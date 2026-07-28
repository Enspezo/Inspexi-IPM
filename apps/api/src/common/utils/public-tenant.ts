import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantContext } from '../interfaces/tenant-context.interface';

/**
 * WP-B7 (B-152) — tenantbinding voor publieke token-lookups.
 *
 * Publieke endpoints (`/public/quotes/:token`, …) zijn capability-URLs: de token
 * ís het geheim. Zonder extra binding resolvet zo'n token echter op ÉLK
 * org-subdomein, waardoor org B de offerte van org A onder haar eigen merknaam
 * kan serveren (en zelfs statuswijzigende acties zoals ondertekenen kan
 * uitvoeren vanaf een vreemde tenantcontext). Deze helper bindt de lookup aan de
 * bezochte tenant.
 *
 * Semantiek per hosttype (zie `TenantMiddleware.classifyHostname`):
 *
 * 1. **Org-subdomein** (`tenant.orgId` gezet) → `{ orgId }`-filter: een token van
 *    een ándere org levert een gewone 404 op — hetzelfde antwoord als een
 *    onbestaand token, dus geen oracle. Legitieme links breken hier nooit op:
 *    zie punt 2.
 *
 * 2. **Apex-/superuser-domein** (`isSuperuserDomain`, orgId null — het kale
 *    BASE_DOMAIN én `mijn.*`) → GEEN filter. **Bewuste keuze (beslispunt
 *    DEP-6, zie docs/TEST-ENV-CHECKLIST.md):** alle gemailde publieke links
 *    worden opgebouwd uit het éne statische `PUBLIC_URL` (=
 *    `getPublicUrl()` → `/offerte/:token`, `/afspraak/:token`) zónder
 *    org-subdomein. Die links landen dus per definitie op het apex-domein;
 *    hier hard weigeren zou élke ooit gemailde link breken. Bovendien rendert
 *    de interne PDF-generatie (Puppeteer) de publieke pagina via diezelfde
 *    `PUBLIC_URL`. Zodra `PUBLIC_URL` per-org-subdomein-bewust wordt, kan dit
 *    pad dichtgezet worden door hieronder óók `notFound()` te gooien — dat is
 *    de enige regel die daarvoor hoeft te wijzigen.
 *
 * 3. **Onbekende host** (orgId null, geen superuser-domein — bv. `127.0.0.1`)
 *    → op `BASE_DOMAIN=localhost` GEEN filter (de e2e-suite draait op
 *    127.0.0.1); in productie fail-secure 404, gespiegeld aan de
 *    TenantGuard-/FeatureGuard-conventie.
 *
 * `tenant` is `undefined` wanneer de middleware niet is toegepast (unit-tests
 * zonder HTTP-laag) → geen filter, net als een ontbrekende `req.tenant` elders.
 *
 * @param tenant   TenantContext van het request (via `@CurrentTenant()`)
 * @param config   ConfigService voor de `BASE_DOMAIN`-check
 * @param label    NL-label voor de generieke 404-melding ("<label> niet gevonden")
 * @returns        Prisma where-fragment: `{ orgId }` of `{}`
 */
export function publicTenantWhere(
  tenant: TenantContext | undefined,
  config: ConfigService,
  label: string,
): { orgId?: string } {
  if (!tenant) return {};

  // (1) Org-subdomein → token moet van déze org zijn.
  if (tenant.orgId !== null) return { orgId: tenant.orgId };

  // (2) Apex/superuser-domein → bewust onbegrensd (gemailde PUBLIC_URL-links).
  if (tenant.isSuperuserDomain) return {};

  // (3) Onbekende host → alleen lokaal/e2e open; in productie fail-secure.
  const isLocalhost = config.get<string>('BASE_DOMAIN', 'localhost') === 'localhost';
  if (isLocalhost) return {};
  throw new NotFoundException(`${label} niet gevonden`);
}
