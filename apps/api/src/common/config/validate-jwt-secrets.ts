/**
 * Fail-fast validatie van de vier JWT-secrets bij bootstrap.
 *
 * Doel: voorkomen dat de app draait met ontbrekende, default of onderling
 * gedeelde secrets. Een gedeeld secret tussen twee realms/token-soorten laat
 * een token uit de ene context in de andere gelden.
 *
 * Regels:
 *  - Ontbrekend of gelijk aan de placeholder `change-me-in-production` → ALTIJD
 *    weigeren (ook in dev/test), zodat niemand per ongeluk met de voorbeeldwaarde
 *    draait.
 *  - Onderling gelijk → alleen in productie weigeren (lokaal/CI mag dezelfde
 *    dev-waarde delen zonder de boot te blokkeren).
 *  - Voorbeeldwaarde uit `.env.example` (exact, of met de markers `dev-only` /
 *    `vervang-mij`) of korter dan 32 tekens → alleen in productie weigeren. De
 *    repo is publiek, dus wie `.env.example` kopieert draait anders met bekende
 *    secrets en tokens van beide auth-realms zijn te vervalsen. Dev/test en de
 *    CI-e2e-job (NODE_ENV=test) booten bewust wél met de voorbeeldwaarden.
 */

export const JWT_SECRET_KEYS = [
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'CLIENT_JWT_SECRET',
  'CLIENT_JWT_REFRESH_SECRET',
] as const;

const PLACEHOLDER = 'change-me-in-production';

/** Exacte voorbeeldwaarden uit `apps/api/.env.example` — houd synchroon. */
const EXAMPLE_VALUES = new Set([
  'dev-only-jwt-secret-vervang-mij-0001',
  'dev-only-jwt-refresh-secret-vervang-mij-0002',
  'dev-only-client-jwt-secret-vervang-mij-0003',
  'dev-only-client-jwt-refresh-secret-vervang-mij-0004',
]);

/** Markers die elke (toekomstige) voorbeeldwaarde draagt; case-insensitive. */
const EXAMPLE_MARKERS = ['dev-only', 'vervang-mij'];

export const MIN_PRODUCTION_SECRET_LENGTH = 32;

function isExampleValue(value: string): boolean {
  const lower = value.toLowerCase();
  return EXAMPLE_VALUES.has(value) || EXAMPLE_MARKERS.some((m) => lower.includes(m));
}

export function validateJwtSecrets(
  env: Record<string, string | undefined>,
  nodeEnv: string | undefined,
): void {
  const errors: string[] = [];

  for (const key of JWT_SECRET_KEYS) {
    const value = env[key];
    if (!value || value.trim().length === 0) {
      errors.push(`${key} ontbreekt`);
    } else if (value === PLACEHOLDER) {
      errors.push(`${key} staat nog op de default-waarde ("${PLACEHOLDER}")`);
    }
  }

  if (nodeEnv === 'production') {
    for (const key of JWT_SECRET_KEYS) {
      const value = env[key];
      if (!value || value.trim().length === 0 || value === PLACEHOLDER) continue;
      if (isExampleValue(value)) {
        errors.push(`${key} staat nog op een voorbeeldwaarde uit .env.example`);
      } else if (value.length < MIN_PRODUCTION_SECRET_LENGTH) {
        errors.push(
          `${key} is te kort (minimaal ${MIN_PRODUCTION_SECRET_LENGTH} tekens vereist)`,
        );
      }
    }

    // Onderling-gelijk alleen in productie afdwingen. Vergelijk paarsgewijs zodat
    // de foutmelding aanwijst wélke twee secrets gelijk zijn.
    for (let i = 0; i < JWT_SECRET_KEYS.length; i++) {
      for (let j = i + 1; j < JWT_SECRET_KEYS.length; j++) {
        const a = env[JWT_SECRET_KEYS[i]];
        const b = env[JWT_SECRET_KEYS[j]];
        if (a && b && a === b) {
          errors.push(
            `${JWT_SECRET_KEYS[i]} en ${JWT_SECRET_KEYS[j]} mogen niet gelijk zijn`,
          );
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Onveilige JWT-configuratie — de applicatie start niet:\n  - ${errors.join('\n  - ')}`,
    );
  }
}
