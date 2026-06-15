import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/page-header';
import { LOOKUP_KINDS } from './lookup-kinds';

export default function LookupsIndexPage() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <PageHeader title="Lookups" description="Beheer organisatie-eigen status- en typewaarden voor het inspectiedomein" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {LOOKUP_KINDS.map((m) => (
          <button
            key={m.kind}
            onClick={() => navigate(`/lookups/${m.kind}`)}
            className="rounded-lg border border-gray-200 bg-white p-4 text-left transition-colors hover:border-primary-400 hover:bg-primary-50"
          >
            <p className="font-medium text-gray-900">{m.label}</p>
            <p className="mt-1 text-sm text-gray-500">{m.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
