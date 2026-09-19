/**
 * Platformbrede kill-switch voor álle @Cron-jobs (staging-review F5).
 *
 * Default aan; alleen de expliciete waarden `'0'` en `'false'` (case-insensitief)
 * schakelen uit — hetzelfde contract als de job-specifieke switches
 * `TOMBSTONE_CLEANUP_ENABLED` en `TIME_TRACKING_SCHEDULER_ENABLED`, die
 * hiernaast blijven bestaan (een job draait alleen als de globale én de eigen
 * switch aan staan). Zet `SCHEDULER_ENABLED=false` op extra API-instanties zodat
 * crons niet dubbel draaien, of om alle jobs tijdens een migratie te bevriezen.
 * Gedocumenteerd in `.env.example`.
 */
export const SCHEDULER_ENABLED_ENV = 'SCHEDULER_ENABLED';

/** Leest `SCHEDULER_ENABLED`; `env` is injecteerbaar voor tests. */
export function isSchedulerEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return isEnabledFlag(env[SCHEDULER_ENABLED_ENV]);
}

/** Default aan; alleen '0'/'false' (case-insensitief) schakelt uit. */
export function isEnabledFlag(raw: string | undefined): boolean {
  const value = raw?.trim().toLowerCase();
  return value !== '0' && value !== 'false';
}
