import { randomInt } from 'crypto';
import { NumberingModel, NumberingMode, NumberingReset } from '@prisma/client';

/**
 * DI-free building blocks for the numbering engine. Kept free of NestJS / Prisma
 * runtime dependencies so the seed script, the backfill script and unit tests can
 * reuse the exact same composition / period / placeholder logic as the service.
 */

/** All models the engine can number today. Extend together with the Prisma enum. */
export const NUMBERING_MODELS: readonly NumberingModel[] = [
  'REQUEST',
  'QUOTE',
  'PROJECT',
  'PRODUCT',
];

/** Per-model catalogue of allowed placeholder tokens (used in prefix/suffix). */
export const MODEL_PLACEHOLDERS: Record<NumberingModel, readonly string[]> = {
  REQUEST: ['jaar', 'maand', 'dag', 'postcode', 'contact'],
  QUOTE: ['jaar', 'maand', 'dag', 'postcode', 'contact'],
  PROJECT: ['jaar', 'maand', 'dag', 'postcode', 'contact'],
  PRODUCT: ['jaar', 'maand', 'dag', 'groep'],
};

/** Human-readable description per placeholder token (for the settings UI / docs). */
export const PLACEHOLDER_LABELS: Record<string, string> = {
  jaar: 'Jaar (JJJJ)',
  maand: 'Maand (MM)',
  dag: 'Dag (DD)',
  postcode: 'Postcode van de locatie',
  contact: 'Naam van de relatie',
  groep: 'Productgroep',
};

export interface DefaultScheme {
  prefix: string;
  suffix: string;
  mode: NumberingMode;
  start: number;
  interval: number;
  digits: number;
  resetPolicy: NumberingReset;
  allowManualEntry: boolean;
}

/**
 * Defaults reproduce the pre-engine behaviour exactly so migrating Quote/Project
 * keeps the existing `OFF-<year>-####` / `P-<year>-####` format, and the new
 * Request/Product numbers get sensible shapes.
 */
export const DEFAULT_SCHEMES: Record<NumberingModel, DefaultScheme> = {
  QUOTE: {
    prefix: 'OFF-[jaar]-',
    suffix: '',
    mode: 'SEQUENTIAL',
    start: 1,
    interval: 1,
    digits: 4,
    resetPolicy: 'PER_YEAR',
    allowManualEntry: false,
  },
  PROJECT: {
    prefix: 'P-[jaar]-',
    suffix: '',
    mode: 'SEQUENTIAL',
    start: 1,
    interval: 1,
    digits: 4,
    resetPolicy: 'PER_YEAR',
    allowManualEntry: false,
  },
  REQUEST: {
    prefix: 'AANV-[jaar]-',
    suffix: '',
    mode: 'SEQUENTIAL',
    start: 1,
    interval: 1,
    digits: 4,
    resetPolicy: 'PER_YEAR',
    allowManualEntry: false,
  },
  PRODUCT: {
    prefix: 'PRD-',
    suffix: '',
    mode: 'SEQUENTIAL',
    start: 1,
    interval: 1,
    digits: 4,
    resetPolicy: 'CONTINUOUS',
    allowManualEntry: false,
  },
};

/** Bounds for the configurable numeric fields (mirrored by the DTO validators). */
export const NUMBERING_LIMITS = {
  minDigits: 1,
  maxDigits: 12,
  minStart: 0,
  maxStart: 1_000_000_000,
  minInterval: 1,
  maxInterval: 1_000_000,
  maxAffixLength: 40,
} as const;

/** Data the engine may need to resolve data-driven placeholders for one record. */
export interface NumberingContext {
  /** Generation date; defaults to "now" at the call site. */
  date?: Date;
  /** Postal code of the linked location (`[postcode]`). */
  postcode?: string | null;
  /** Display name of the linked contact (`[contact]`). */
  contact?: string | null;
  /** Product group name (`[groep]`). */
  groep?: string | null;
}

/** Reduce a free-text placeholder value to a number-safe token (UPPER, alphanumeric). */
export function sanitizePlaceholderValue(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/** Period bucket for the counter, derived from the reset policy + date. */
export function periodKeyFor(resetPolicy: NumberingReset, date: Date): string {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  switch (resetPolicy) {
    case 'PER_YEAR':
      return yyyy;
    case 'PER_MONTH':
      return `${yyyy}-${mm}`;
    case 'CONTINUOUS':
    default:
      return '';
  }
}

/** Left-pad a numeric value to at least `digits` characters (never truncates). */
export function zeroPad(value: number, digits: number): string {
  return String(Math.abs(Math.trunc(value))).padStart(digits, '0');
}

/** A uniformly-random candidate in [0, 10^digits) for RANDOM mode. */
export function randomCandidate(digits: number): number {
  const span = Math.pow(10, Math.max(1, digits));
  return randomInt(0, span);
}

/** Build the token→value map for one generation. */
function placeholderValues(
  model: NumberingModel,
  ctx: NumberingContext,
  date: Date,
): Record<string, string> {
  return {
    jaar: String(date.getFullYear()),
    maand: String(date.getMonth() + 1).padStart(2, '0'),
    dag: String(date.getDate()).padStart(2, '0'),
    postcode: sanitizePlaceholderValue(ctx.postcode),
    contact: sanitizePlaceholderValue(ctx.contact),
    groep: sanitizePlaceholderValue(ctx.groep),
  };
}

/** Replace `[token]` occurrences; unknown/empty tokens collapse to '' (uniqueness comes from the number). */
export function resolvePlaceholders(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(/\[(\w+)\]/g, (_match, token: string) => {
    const key = token.toLowerCase();
    return key in values ? values[key] : '';
  });
}

interface SchemeShape {
  model: NumberingModel;
  prefix: string;
  suffix: string;
  digits: number;
}

/** Resolve a scheme's prefix + suffix for a given context/date (placeholders → values). */
export function resolveAffixes(
  scheme: SchemeShape,
  ctx: NumberingContext,
  date: Date,
): { prefix: string; suffix: string } {
  const values = placeholderValues(scheme.model, ctx, date);
  return {
    prefix: resolvePlaceholders(scheme.prefix, values),
    suffix: resolvePlaceholders(scheme.suffix, values),
  };
}

/** Compose the final number: resolve(prefix) + zeroPad(value) + resolve(suffix). */
export function composeNumber(
  scheme: SchemeShape,
  numericValue: number,
  ctx: NumberingContext,
  date: Date,
): string {
  const { prefix, suffix } = resolveAffixes(scheme, ctx, date);
  return `${prefix}${zeroPad(numericValue, scheme.digits)}${suffix}`;
}

export interface AffixValidation {
  valid: boolean;
  /** Dutch error message when invalid. */
  error?: string;
}

/**
 * Validate a prefix/suffix for a model: every `[token]` must be allowed for that
 * model, and the literal text (placeholders removed) may only contain letters,
 * digits and the separators `- _ / .`.
 */
export function validateAffix(
  value: string,
  model: NumberingModel,
  label: string,
): AffixValidation {
  if (value.length > NUMBERING_LIMITS.maxAffixLength) {
    return { valid: false, error: `${label} mag maximaal ${NUMBERING_LIMITS.maxAffixLength} tekens bevatten` };
  }
  const allowed = MODEL_PLACEHOLDERS[model];
  const tokens = [...value.matchAll(/\[(\w+)\]/g)].map((m) => m[1].toLowerCase());
  for (const token of tokens) {
    if (!allowed.includes(token)) {
      return {
        valid: false,
        error: `Placeholder [${token}] is niet toegestaan voor dit type (toegestaan: ${allowed
          .map((t) => `[${t}]`)
          .join(', ')})`,
      };
    }
  }
  const literal = value.replace(/\[(\w+)\]/g, '');
  if (!/^[A-Za-z0-9\-_/.]*$/.test(literal)) {
    return {
      valid: false,
      error: `${label} mag alleen letters, cijfers, placeholders en de tekens - _ / . bevatten`,
    };
  }
  return { valid: true };
}

/**
 * True when the prefix/suffix use a data-driven (non-date) placeholder, so the
 * caller's context loader must run. The default schemes use only `[jaar]`, so the
 * common path skips the extra lookups entirely.
 */
export function schemeNeedsContext(prefix: string, suffix: string): boolean {
  return /\[(postcode|contact|groep)\]/i.test(`${prefix}${suffix}`);
}

/** A representative context so the settings UI / preview always renders every token. */
export function sampleContext(model: NumberingModel): NumberingContext {
  if (model === 'PRODUCT') return { groep: 'Algemeen' };
  return { postcode: '1234AB', contact: 'Voorbeeld BV' };
}
