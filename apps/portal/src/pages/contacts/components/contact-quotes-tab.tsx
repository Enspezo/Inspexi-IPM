import { useNavigate } from 'react-router-dom';
import { Button, StatusBadge } from '@/components/ui';
import { formatCurrency, formatShortDate } from '@/lib/format';
import { QUOTE_STATUS } from '@/lib/status';
import type { Contact } from '@/types';

export function ContactQuotesTab({
  contact,
  userCanWrite,
}: {
  contact: Contact;
  userCanWrite: boolean;
}) {
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      {userCanWrite && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => navigate(`/quotes/new?contactId=${contact.id}`)}>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Offerte aanmaken
          </Button>
        </div>
      )}
      {(contact.quotes?.length || 0) === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">
          Nog geen offertes voor deze relatie
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Nummer
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Onderwerp
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Totaal
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Datum
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {contact.quotes?.map((quote) => (
                <tr
                  key={quote.id}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => navigate(`/quotes/${quote.id}`)}
                >
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-primary-600">
                    {quote.quoteNumber}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {quote.subject}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm">
                    <StatusBadge status={quote.status} map={QUOTE_STATUS} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-900">
                    {formatCurrency(quote.total)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                    {formatShortDate(quote.createdAt)}
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
