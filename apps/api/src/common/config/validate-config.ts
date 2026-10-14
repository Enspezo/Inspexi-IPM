/**
 * Fail-fast validatie van de overige runtime-config bij bootstrap (staging-
 * review F3). Draait direct ná `validateJwtSecrets()` in `main.ts`.
 *
 * Alleen streng buiten development/test: de lokale dev-server en de e2e-suite
 * draaien met een minimale `.env` en moeten ongewijzigd blijven werken. In een
 * gedeelde omgeving (staging/productie → `NODE_ENV=production`) weigeren we
 * te starten bij:
 *  - een onbekende `NODE_ENV` (staging hoort `production` te gebruiken — er is
 *    géén aparte 'staging'-modus; een typefout zou de app anders stilzwijgend
 *    in dev-modus laten draaien, met throttling/cookies/Swagger op dev-stand);
 *  - ontbrekende `PUBLIC_URL` (alle gemailde links zouden naar localhost wijzen);
 *  - `CONVERT_API_KEY` op de placeholder (DEP-13);
 *  - ontbrekende `RESEND_API_KEY` (de SDK faalt anders pas bij de eerste mail
 *    met een nietszeggende "Missing API key").
 *
 * Waarschuwt (zonder te stoppen) wanneer `KVK_USE_TEST_ENV=true` in productie —
 * de KvK-lookups praten dan tegen de test-omgeving (nep-data).
 */

export const KNOWN_NODE_ENVS = ['development', 'test', 'production'] as const;

const PLACEHOLDER = 'change-me-in-production';

export interface ConfigValidationResult {
  errors: string[];
  warnings: string[];
}

function isBlank(value: string | undefined): boolean {
  return !value || value.trim().length === 0;
}

/** Pure kern: geeft fouten/waarschuwingen terug zonder te gooien of te loggen. */
export function checkConfig(env: Record<string, string | undefined>): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const nodeEnv = env.NODE_ENV;

  // Onbekende NODE_ENV: altijd hard — dit is per definitie een misconfiguratie.
  if (!isBlank(nodeEnv) && !(KNOWN_NODE_ENVS as readonly string[]).includes(nodeEnv!)) {
    errors.push(
      `NODE_ENV="${nodeEnv}" is onbekend; gebruik development | test | production ` +
        `(voor staging: NODE_ENV=production — er is geen aparte staging-modus)`,
    );
  }

  const strict = nodeEnv === 'production';
  if (strict) {
    if (isBlank(env.PUBLIC_URL)) {
      errors.push('PUBLIC_URL ontbreekt (alle gemailde links zouden naar localhost wijzen)');
    }
    if (env.CONVERT_API_KEY === PLACEHOLDER) {
      errors.push(`CONVERT_API_KEY staat nog op de default-waarde ("${PLACEHOLDER}")`);
    }
    if (isBlank(env.RESEND_API_KEY)) {
      errors.push(
        'RESEND_API_KEY ontbreekt (zonder sleutel kan geen enkele e-mail — reset, ' +
          'uitnodiging, magic-link, offerte — verstuurd worden)',
      );
    }
    if ((env.KVK_USE_TEST_ENV ?? '').trim().toLowerCase() === 'true') {
      warnings.push(
        'KVK_USE_TEST_ENV=true in productie: KvK-lookups gebruiken de test-omgeving (nep-data); ' +
          'zet op false met een echte KVK_API_KEY',
      );
    }
  }

  return { errors, warnings };
}

/**
 * Gooit bij fouten (de app start niet) en logt waarschuwingen via `warn`.
 * `warn` is injecteerbaar zodat de spec geen Logger hoeft te mocken.
 */
export function validateConfig(
  env: Record<string, string | undefined>,
  warn: (message: string) => void = (m) => console.warn(m),
): void {
  const { errors, warnings } = checkConfig(env);
  for (const w of warnings) warn(w);
  if (errors.length > 0) {
    throw new Error(
      `Onvolledige runtime-configuratie — de applicatie start niet:\n  - ${errors.join('\n  - ')}`,
    );
  }
}
