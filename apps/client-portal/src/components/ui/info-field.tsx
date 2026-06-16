import type { ReactNode } from 'react';

interface InfoFieldProps {
  label: string;
  value: ReactNode;
}

/**
 * Lees-modus veld voor detailpagina's (dt/dd-paar).
 * Lege waarden worden als '—' getoond.
 */
export function InfoField({ label, value }: InfoFieldProps) {
  const isEmpty = value == null || value === '';

  return (
    <div>
      <dt className="text-sm font-medium text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900">{isEmpty ? '—' : value}</dd>
    </div>
  );
}
