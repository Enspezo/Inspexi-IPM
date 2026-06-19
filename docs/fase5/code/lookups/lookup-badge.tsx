// Doel in apps/portal: src/components/ui/lookup-badge.tsx (+ export via components/ui/index.ts)
//
// Badge voor lookup-gedreven status/type-velden. Resolveert code → label + hex-kleur uit de
// per-org lookup. Spiegelt <StatusBadge> (voor enums), maar dynamisch uit de DB.
//
//   <LookupBadge kind="plan-status-types" code={plan.statusCode} />

import { useLookups, type LookupKind } from '@/lib/lookups';

interface LookupBadgeProps {
  kind: LookupKind;
  code: string | null | undefined;
  className?: string;
}

export function LookupBadge({ kind, code, className = '' }: LookupBadgeProps) {
  const { data } = useLookups(kind);
  const row = code ? data?.find((r) => r.code === code) : null;
  const label = row?.label ?? code ?? '—';
  const color = row?.color ?? '#6B7280';

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
      style={{ backgroundColor: `${color}1A`, color }} // hex + ~10% alpha achtergrond
    >
      {label}
    </span>
  );
}
