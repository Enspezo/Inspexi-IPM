import { useNavigate } from 'react-router-dom';
import { formatShortDate } from '@/lib/format';
import { getStatusConfig, PLANNING_STATUS } from '@/lib/status';
import type { PlanningItem } from '@/types';

export function ContactPlanningTab({ items }: { items: PlanningItem[] }) {
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">
          Nog geen planning voor deze relatie
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Dienst
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Datum
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Locatie
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Inspecteur(s)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => navigate(`/planning/${item.id}`)}
                >
                  <td className="px-4 py-3 text-sm font-medium text-primary-600">
                    {item.productName}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        item.isCancelled
                          ? 'bg-red-100 text-red-800'
                          : getStatusConfig(PLANNING_STATUS, item.status).classes
                      }`}
                    >
                      {item.isCancelled ? 'Geannuleerd' : getStatusConfig(PLANNING_STATUS, item.status).label}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                    <div className="flex items-center gap-1.5">
                      {item.scheduledDate ? formatShortDate(item.scheduledDate) : '—'}
                      {item.isMultiDay && (
                        <span className="rounded bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-700">
                          Meerdaags
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {item.location
                      ? `${item.location.name}${item.location.city ? `, ${item.location.city}` : ''}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {item.inspectors && item.inspectors.length > 0
                      ? item.inspectors.map((i) =>
                          i.user ? `${i.user.firstName} ${i.user.lastName}` : '—'
                        ).join(', ')
                      : '—'}
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
