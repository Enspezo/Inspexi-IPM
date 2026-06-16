import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useRequests } from './hooks/use-requests';
import { Spinner, Card, LookupBadge, ErrorBox } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { RequestDetailModal } from './components/request-detail-modal';
import type { ClientRequest } from '@/types';

export default function RequestsPage() {
  const { data, isLoading, error } = useRequests();
  const [selected, setSelected] = useState<string | null>(null);
  const requests = data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mijn verzoeken</h1>
          <p className="mt-1 text-sm text-gray-600">Herinspecties en nieuwe opdrachten die u heeft aangevraagd.</p>
        </div>
        <Link
          to="/requests/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nieuwe opdracht
        </Link>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      )}

      {error && <ErrorBox>Kon de verzoeken niet laden.</ErrorBox>}

      {data &&
        (requests.length === 0 ? (
          <Card>
            <p className="py-10 text-center text-sm text-gray-500">U heeft nog geen verzoeken ingediend.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {requests.map((request) => (
              <RequestCard key={request.id} request={request} onClick={() => setSelected(request.id)} />
            ))}
          </div>
        ))}

      {selected && <RequestDetailModal requestId={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function RequestCard({ request, onClick }: { request: ClientRequest; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-gray-300"
    >
      <div className="flex flex-wrap items-center gap-2">
        <LookupBadge kind="client-request-types" code={request.requestTypeCode} />
        <LookupBadge kind="client-request-status-types" code={request.statusCode} />
      </div>
      <p className="mt-2 text-sm font-medium text-gray-900">{request.subject}</p>
      <p className="mt-0.5 line-clamp-2 text-sm text-gray-600">{request.description}</p>
      <p className="mt-2 text-xs text-gray-400">
        Ingediend op {formatDate(request.createdAt)}
        {request.relatedInspectionPlan ? ` · ${request.relatedInspectionPlan.projectName}` : ''}
      </p>
    </button>
  );
}
