// Types voor het klantportaal. Spiegelen de response-shapes van de Beheer client-* endpoints
// (apps/api/src/modules/client-*). De backend levert codes (statusCode/normTypeCode/…), die in de
// UI via <LookupBadge> (per-org lookups) of een vaste enum-map (lib/status.ts) gerenderd worden.

// ApiError is aantoonbaar identiek in béide web-apps → gedeeld via @inspexi/shared-web.
export type { ApiError } from '@inspexi/shared-web';

export * from './common';
export * from './auth';
export * from './documents';
export * from './inspections';
export * from './findings';
export * from './messages';
export * from './requests';
export * from './dashboard';
export * from './repair';
