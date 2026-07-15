import { useConfirm } from '@/components/ui';
import {
  extractAvailabilityWarnings,
  formatAvailabilityWarning,
} from '../lib/availability-warnings';

/**
 * Wikkelt een planning-mutatie in de beschikbaarheids-override-flow (PRD-12
 * §12.9). `perform(override)` wordt eerst zonder override aangeroepen; geeft de
 * backend een 409 met beschikbaarheids-warnings, dan verschijnt een
 * `useConfirm`-dialoog met per inspecteur een NL-uitleg. Bevestigt de planner,
 * dan draait `perform(true)` (override); annuleert die, dan gebeurt er niets.
 *
 * Andere fouten worden doorgegooid zodat de mutatie-`onError` ze normaal afhandelt.
 */
export function useAvailabilityOverride() {
  const confirm = useConfirm();

  return async function withAvailabilityOverride<T>(
    perform: (override: boolean) => Promise<T>,
  ): Promise<{ ok: boolean; result?: T }> {
    try {
      return { ok: true, result: await perform(false) };
    } catch (error) {
      const warnings = extractAvailabilityWarnings(error);
      if (warnings.length === 0) throw error;

      const confirmed = await confirm({
        title: 'Beschikbaarheidswaarschuwing',
        message: (
          <div className="space-y-2">
            <p>Let op — niet iedereen is beschikbaar op de gekozen datum:</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
              {warnings.map((w) => (
                <li key={w.userId}>{formatAvailabilityWarning(w)}</li>
              ))}
            </ul>
            <p>Toch inplannen?</p>
          </div>
        ),
        confirmLabel: 'Toch inplannen',
        cancelLabel: 'Annuleren',
        variant: 'primary',
      });
      if (!confirmed) return { ok: false };

      return { ok: true, result: await perform(true) };
    }
  };
}
