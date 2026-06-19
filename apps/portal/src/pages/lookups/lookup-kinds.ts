import type { LookupKind } from '@/lib/lookups';

export interface LookupKindMeta {
  kind: LookupKind;
  label: string;
  description: string;
}

/** Beheerbare lookup-soorten met Nederlandse labels (volgorde = weergave in index). */
export const LOOKUP_KINDS: LookupKindMeta[] = [
  { kind: 'inspection-types', label: 'Inspectietypes', description: 'Soorten inspecties' },
  { kind: 'plan-status-types', label: 'Inspectiestatussen', description: 'Statussen van inspectieplannen' },
  { kind: 'asset-status-types', label: 'Asset-statussen', description: 'Statussen van assets' },
  { kind: 'finding-status-types', label: 'Constatering-statussen', description: 'Statussen van constateringen' },
  { kind: 'report-status-types', label: 'Rapport-statussen', description: 'Statussen van rapporten' },
  { kind: 'signatory-types', label: 'Ondertekenaar-types', description: 'Typen ondertekenaars' },
  { kind: 'signer-roles', label: 'Ondertekenaar-rollen', description: 'Rollen van ondertekenaars in documenten' },
  { kind: 'pass-fail-status-types', label: 'Pass/fail-statussen', description: 'Goed/afgekeurd-resultaten van metingen' },
  { kind: 'resolution-status-types', label: 'Oplossing-statussen', description: 'Statussen voor het oplossen van constateringen' },
  { kind: 'client-request-types', label: 'Klantverzoek-types', description: 'Typen klantverzoeken' },
  { kind: 'client-request-status-types', label: 'Klantverzoek-statussen', description: 'Statussen van klantverzoeken' },
];

export const LOOKUP_KIND_LABELS: Record<LookupKind, string> = LOOKUP_KINDS.reduce(
  (acc, m) => { acc[m.kind] = m.label; return acc; },
  {} as Record<LookupKind, string>,
);

export function isLookupKind(value: string | undefined): value is LookupKind {
  return !!value && LOOKUP_KINDS.some((m) => m.kind === value);
}
