import { Link } from 'react-router-dom';
import { Modal, Spinner, LookupBadge, ErrorBox, InfoField } from '@/components/ui';
import { useRequest } from '../hooks/use-requests';
import { formatDate } from '@/lib/format';
import { contactName } from '@/lib/labels';

interface RequestDetailModalProps {
  requestId: string;
  onClose: () => void;
}

export function RequestDetailModal({ requestId, onClose }: RequestDetailModalProps) {
  const { data: request, isLoading, error } = useRequest(requestId);

  return (
    <Modal isOpen title="Verzoek" onClose={onClose} className="max-w-lg">
      {isLoading && (
        <div className="flex justify-center py-8">
          <Spinner size="lg" />
        </div>
      )}

      {error && <ErrorBox>Kon het verzoek niet laden.</ErrorBox>}

      {request && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <LookupBadge kind="client-request-types" code={request.requestTypeCode} />
            <LookupBadge kind="client-request-status-types" code={request.statusCode} />
          </div>

          <h3 className="text-base font-semibold text-gray-900">{request.subject}</h3>
          <p className="whitespace-pre-wrap text-sm text-gray-700">{request.description}</p>

          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InfoField label="Ingediend op" value={formatDate(request.createdAt)} />
            <InfoField label="Opdrachtgever" value={contactName(request.contact)} />
            <InfoField
              label="Voorkeursdatum"
              value={request.preferredDate ? formatDate(request.preferredDate) : null}
            />
            <InfoField label="Afgehandeld op" value={request.handledAt ? formatDate(request.handledAt) : null} />
          </dl>

          {request.relatedInspectionPlan && (
            <Link
              to={`/inspections/${request.relatedInspectionPlan.id}`}
              onClick={onClose}
              className="block rounded-lg bg-gray-50 px-3 py-2 text-sm text-primary-600 hover:bg-gray-100"
            >
              Gerelateerde inspectie: {request.relatedInspectionPlan.projectName}
            </Link>
          )}

          {request.responseNotes && (
            <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
              <p className="font-medium">Reactie van de organisatie</p>
              <p className="mt-0.5 whitespace-pre-wrap">{request.responseNotes}</p>
            </div>
          )}

          {request.resultingInspectionPlanId && (
            <Link
              to={`/inspections/${request.resultingInspectionPlanId}`}
              onClick={onClose}
              className="block rounded-lg bg-success-50 px-3 py-2 text-sm font-medium text-success-600 hover:bg-green-100"
            >
              Bekijk de aangemaakte inspectie →
            </Link>
          )}
        </div>
      )}
    </Modal>
  );
}
