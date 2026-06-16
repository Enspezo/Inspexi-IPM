// Versiehistorie-tab: lijst van versie-overgangen met omschrijving + tijdstip. Alleen-lezen.

import { Card, Spinner } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { useChecklistHistory } from '../hooks/use-checklists';

interface Props {
  checklistId: string;
}

export function ChecklistHistoryTab({ checklistId }: Props) {
  const { data, isLoading } = useChecklistHistory(checklistId);

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner size="lg" />
      </div>
    );
  }

  const entries = data ?? [];

  return (
    <Card title={`Versiehistorie (${entries.length})`}>
      {entries.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">Nog geen historie.</p>
      ) : (
        <ol className="space-y-3">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="rounded-lg border border-gray-200 bg-white px-4 py-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                  v{entry.fromVersion}
                  {entry.fromVersion !== entry.toVersion ? ` → v${entry.toVersion}` : ''}
                </span>
                <span className="text-xs text-gray-500">
                  {entry.fromStatus} → {entry.toStatus}
                </span>
                <span className="ml-auto text-xs text-gray-400">{formatDate(entry.changedAt)}</span>
              </div>
              <p className="mt-1.5 text-sm text-gray-900">{entry.changeDescription}</p>
              {entry.approvalReason && (
                <p className="mt-0.5 text-xs text-gray-500">Goedkeuring: {entry.approvalReason}</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
