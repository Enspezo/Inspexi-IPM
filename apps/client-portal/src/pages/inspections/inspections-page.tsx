import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useInspections } from './hooks/use-inspections';
import { Spinner, Card, LookupBadge, ErrorBox, Input } from '@/components/ui';
import { addressLine, formatDate } from '@/lib/format';
import { normTypeLabel } from '@/lib/labels';
import type { InspectionListItem } from '@/types';

export default function InspectionsPage() {
  const { data, isLoading, error } = useInspections();
  const [search, setSearch] = useState('');

  const inspections = useMemo(() => {
    const all = data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((i) =>
      [i.projectName, i.addressCity, i.addressStreet, i.referenceNumber]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q)),
    );
  }, [data, search]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mijn inspecties</h1>
        <p className="mt-1 text-sm text-gray-600">Alle inspecties waar u toegang toe heeft.</p>
      </div>

      <div className="max-w-sm">
        <Input
          placeholder="Zoeken op locatie, projectnaam…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      )}

      {error && <ErrorBox>Kon de inspecties niet laden. Probeer het later opnieuw.</ErrorBox>}

      {data && (
        <Card>
          {inspections.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500">
              {search ? 'Geen inspecties gevonden voor deze zoekopdracht.' : 'Nog geen inspecties gevonden.'}
            </p>
          ) : (
            <div className="divide-y divide-gray-100">
              {inspections.map((inspection) => (
                <InspectionRow key={inspection.id} inspection={inspection} />
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function InspectionRow({ inspection }: { inspection: InspectionListItem }) {
  return (
    <Link
      to={`/inspections/${inspection.id}`}
      className="flex items-center justify-between gap-4 py-4 transition-colors hover:bg-gray-50"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-gray-900">{inspection.projectName}</p>
        <p className="truncate text-xs text-gray-500">{addressLine(inspection)}</p>
        {inspection.referenceNumber && (
          <p className="mt-0.5 text-xs text-gray-400">Ref. {inspection.referenceNumber}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="hidden text-xs text-gray-500 sm:block">{normTypeLabel(inspection.normTypeCode)}</span>
        <span className="hidden text-xs text-gray-500 md:block">{formatDate(inspection.plannedDate)}</span>
        <LookupBadge kind="plan-status-types" code={inspection.statusCode} />
      </div>
    </Link>
  );
}
