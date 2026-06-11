import { useNavigate } from 'react-router-dom';
import { Button, StatusBadge } from '@/components/ui';
import { formatShortDate } from '@/lib/format';
import { PRIORITY, REQUEST_STATUS } from '@/lib/status';
import type { Contact } from '@/types';

export function ContactRequestsTab({
  contact,
  userCanWrite,
  onCreateRequest,
}: {
  contact: Contact;
  userCanWrite: boolean;
  onCreateRequest: () => void;
}) {
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      {userCanWrite && (
        <div className="flex justify-end">
          <Button size="sm" onClick={onCreateRequest}>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Aanvraag aanmaken
          </Button>
        </div>
      )}
      {(contact.requests?.length || 0) === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">
          Nog geen aanvragen voor deze relatie
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Titel
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Prioriteit
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Toegewezen aan
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Datum
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {contact.requests?.map((request) => (
                <tr
                  key={request.id}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => navigate(`/requests/${request.id}`)}
                >
                  <td className="px-4 py-3 text-sm font-medium text-primary-600">
                    {request.title}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm">
                    <StatusBadge status={request.status} map={REQUEST_STATUS} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm">
                    <StatusBadge status={request.priority} map={PRIORITY} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                    {request.assignedUser
                      ? `${request.assignedUser.firstName} ${request.assignedUser.lastName}`
                      : '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                    {formatShortDate(request.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
