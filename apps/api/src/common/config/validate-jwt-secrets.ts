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
 */

export const JWT_SECRET_KEYS = [
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'CLIENT_JWT_SECRET',
  'CLIENT_JWT_REFRESH_SECRET',
] as const;

const PLACEHOLDER = 'change-me-in-production';

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

  // Onderling-gelijk alleen in productie afdwingen. Vergelijk paarsgewijs zodat
  // de foutmelding aanwijst wélke twee secrets gelijk zijn.
  if (nodeEnv === 'production') {
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
