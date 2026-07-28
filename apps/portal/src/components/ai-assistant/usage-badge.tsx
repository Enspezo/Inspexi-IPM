import { useAiUsage } from './hooks/use-ai';

/** Klein tegoed-indicatortje (verbruikte tokens deze maand vs. plafond). */
export function UsageBadge() {
  const { data } = useAiUsage();
  if (!data) return null;

  const pct = data.monthlyQuota > 0 ? Math.min(100, Math.round((data.monthTokens / data.monthlyQuota) * 100)) : 0;
  const near = pct >= 90;

  return (
    <div
      className="flex items-center gap-1.5 text-[11px] text-gray-400"
      title={`${data.monthTokens.toLocaleString('nl-NL')} van ${data.monthlyQuota.toLocaleString('nl-NL')} tokens deze maand`}
    >
      <span className="inline-block h-1.5 w-16 overflow-hidden rounded-full bg-gray-200">
        <span
          className={`block h-full rounded-full ${near ? 'bg-danger-500' : 'bg-primary-400'}`}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span>{pct}%</span>
    </div>
  );
}
