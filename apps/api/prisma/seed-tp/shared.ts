/**
 * Gedeelde bouwstenen voor het testprogramma-seed (docs/testprogramma/01-seed-datasets.md).
 *
 * Uitgangspunten:
 * - Dit script draait NAAST de bestaande `seed.ts` en mag die data NIET wissen.
 *   Gebruik dus nooit een ongefilterde `deleteMany()`; ruim alleen eigen data op,
 *   gescoped op orgId of op de TP_-prefixen hieronder.
 * - Idempotent: upsert op natuurlijke unieke sleutels, of "gescoped deleteMany + create"
 *   voor modellen zonder unieke sleutel (Finding, MeasurementSheetRecord, markers).
 */

import type { PrismaClient } from '@prisma/client';

/** Prefix voor alle door dit script aangemaakte, herkenbare records. */
export const TP = 'TP';

/** Wachtwoord van elk testaccount (gelijk aan de hoofdseed). */
export const TP_PASSWORD = 'Password123!';

/**
 * "Vuile" strings uit §J van 01-seed-datasets.md. Verspreid deze over tekstvelden
 * zodat lijsten, detailpagina's én gegenereerde documenten ze moeten escapen.
 */
export const DIRTY = {
  script: `<script>alert('x')</script>`,
  imgOnerror: `<img src=x onerror=alert(1)>`,
  sqlDrop: `'; DROP TABLE imp_users;--`,
  sqlContact: `Robert'); DROP TABLE--`,
  emoji: '🔧🚀',
  rtl: 'مرحبا',
  cjk: '检查',
  zeroWidth: 'a​b',
  mixed: 'Tëst 测试 🚀',
  longName: 'L'.repeat(220),
  hugeText: 'Lorem ipsum dolor sit amet. '.repeat(200), // ~5600 tekens
} as const;

/** Slugs van de organisaties die dit script gebruikt/aanmaakt. */
export const SLUGS = {
  demo: 'inspexidemo',
  test: 'testbedrijf',
  rand: 'randorg',
} as const;

/**
 * Id-verzameling die tussen de deelscripts wordt doorgegeven.
 * Bewust losse string-maps: robuust tegen schemawijzigingen, makkelijk te loggen.
 */
export interface TpRefs {
  orgs: Record<string, string>;
  users: Record<string, string>;
  clientUsers: Record<string, string>;
  contacts: Record<string, string>;
  locations: Record<string, string>;
  products: Record<string, string>;
  priceTables: Record<string, string>;
  requests: Record<string, string>;
  quotes: Record<string, string>;
  projects: Record<string, string>;
  planning: Record<string, string>;
  plans: Record<string, string>;
  assetNodes: Record<string, string>;
  findings: Record<string, string>;
  documents: Record<string, string>;
}

export function emptyRefs(): TpRefs {
  return {
    orgs: {},
    users: {},
    clientUsers: {},
    contacts: {},
    locations: {},
    products: {},
    priceTables: {},
    requests: {},
    quotes: {},
    projects: {},
    planning: {},
    plans: {},
    assetNodes: {},
    findings: {},
    documents: {},
  };
}

/** Datum-helper: vaste peildatum zodat de seed reproduceerbaar is. */
export const TODAY = new Date('2026-07-27T00:00:00.000Z');

export function daysFromToday(days: number): Date {
  return new Date(TODAY.getTime() + days * 24 * 60 * 60 * 1000);
}

/** Logt een stap; houdt de seed-output leesbaar. */
export function step(message: string): void {
  // eslint-disable-next-line no-console
  console.log(`  · ${message}`);
}

/**
 * Zoekt een bestaande rij op een niet-unieke combinatie en maakt hem anders aan.
 * Vervangt `upsert` waar het schema geen bruikbare unieke sleutel heeft.
 */
export async function findOrCreate<T extends { id: string }>(
  find: () => Promise<T | null>,
  create: () => Promise<T>,
): Promise<T> {
  const existing = await find();
  return existing ?? (await create());
}

export type Prisma = PrismaClient;
